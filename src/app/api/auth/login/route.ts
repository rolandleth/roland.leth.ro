import { createHmac } from "node:crypto"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"
import { loginSchema } from "@/lib/api/schemas"
import { verifyCredentials, createSession } from "@/lib/auth/auth"
import { getIpHashSecret, getRedisConfig } from "@/lib/auth/env"

// Construct from the resolved config object so the abstraction in `env.ts`
// stays the single source of truth — `Redis.fromEnv()` would re-read
// `process.env` directly and silently desync if the var names ever change.
const redisConfig = getRedisConfig()
const ipHashSecret = getIpHashSecret()
// Rate limiting only needs Redis to hold the buckets. The HMAC secret controls
// granularity, not whether the limiter runs: with it, each client IP gets its
// own budget; without it, all requests share one global bucket (see
// `bucketKey`). A global bucket lets a botnet exhaust the budget and lock the
// admin out — the tradeoff we accept rather than skip rate limiting entirely,
// or regress to plain-IP keys (the IPv4 keyspace is small enough that a plain
// hash is reversible by brute force). No Redis still falls open.
const ratelimit =
	redisConfig !== null
		? new Ratelimit({
				redis: new Redis(redisConfig),
				limiter: Ratelimit.slidingWindow(5, "15 m"),
				prefix: "rl:login",
			})
		: null

if (redisConfig !== null && ipHashSecret === null) {
	// Visible config gap: Redis is wired but the HMAC secret isn't, so the
	// limiter degrades to a single shared bucket. Surface at warn so a missed
	// env var on deploy is discoverable from the function logs.
	// eslint-disable-next-line no-console
	console.warn(
		"[api:auth:login] IP_HASH_SECRET not configured, rate limiting falls back to a global bucket"
	)
}

/**
 * Fixed bucket key shared by every request when no `IP_HASH_SECRET` is set.
 * Carries no IP, so it's safe to write to Upstash and the audit log. Client
 * keys carry an `ip:` prefix (see `clientBucketKey`) so the two keyspaces
 * stay formally disjoint under the shared `rl:login` Redis prefix.
 */
const globalBucketKey = "global"

/**
 * Returns the per-client rate-limit bucket key: `ip:` + the
 * HMAC-pseudonymized client IP. The `ip:` prefix keeps this keyspace formally
 * disjoint from `globalBucketKey`, so no future change to the derivation can
 * conflate a client bucket with the fallback bucket.
 *
 * Vercel sets `x-forwarded-for` with a comma-separated list (leftmost is the
 * original client) and sanitizes inbound spoofed values at its edge, so
 * trusting the leftmost entry is safe *only on Vercel* (or behind a proxy
 * that normalizes the header the same way). Behind an untrusted proxy the
 * leftmost entry is attacker-controlled — switch to `x-real-ip` or the
 * platform's trusted equivalent if this app ever moves off Vercel. Requests
 * with no forwarded header bucket together under the literal `"unknown"` so
 * they don't piggyback on each other's budget.
 *
 * Hashing the IP — rather than storing it plain — keeps the bucket stable per
 * client without writing personal data to Upstash or to the audit log. The
 * IPv4 keyspace is only ~4B, so a plain SHA-256 is reversible by brute force;
 * HMAC with a server-side secret blocks that.
 */
function clientBucketKey(request: NextRequest, secret: string): string {
	const forwarded = request.headers.get("x-forwarded-for")
	let rawIp = "unknown"

	if (forwarded != null && forwarded !== "") {
		const first = forwarded.split(",")[0]?.trim()

		if (first !== undefined && first !== "") {
			rawIp = first
		}
	}

	const hash = createHmac("sha256", secret)
		.update(rawIp)
		.digest("base64url")
		.slice(0, 22)

	return `ip:${hash}`
}

/**
 * Resolves the rate-limit bucket key for a request. With an `IP_HASH_SECRET`
 * configured, each client IP gets its own 5/15min budget; without one, every
 * request shares `globalBucketKey` — coarser protection that still caps total
 * login attempts, at the cost of a botnet being able to lock the admin out.
 */
function bucketKey(request: NextRequest): string {
	return ipHashSecret !== null
		? clientBucketKey(request, ipHashSecret)
		: globalBucketKey
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	// Per-IP keying when the HMAC secret is set, else a single shared bucket.
	// Per-IP avoids the previous global-bucket failure mode where a stale
	// botnet of 5 failed attempts/15min locks the legitimate admin out of the
	// only public auth entry point; the global fallback re-accepts that risk
	// when no secret is configured, as the lesser evil over no limiter at all.
	// Resolved once so the limiter and the invalid-credentials log share the
	// exact same key — the HMAC runs once per request and the two call sites
	// can't drift apart.
	const key = bucketKey(request)

	if (ratelimit) {
		try {
			const { success } = await ratelimit.limit(key)

			if (!success) {
				// Routine adversarial signal — a botnet hitting the limiter is
				// expected; info (not warn) so a dashboard can partition
				// hostile-traffic noise away from operator-actionable lines
				// like the fail-open below. Credential-misconfig and code bugs
				// stay at error.
				// eslint-disable-next-line no-console
				console.info("[api:auth:login] rate limit exceeded", { key })

				return NextResponse.json(
					{ error: "Too many requests" },
					{ status: 429 }
				)
			}
		} catch (error) {
			// Fail-open: a transient Upstash blip should not lock the admin out.
			// Error (not warn): unlike the routine 429s above, Redis being
			// unreachable is operator-actionable and a dashboard should be able
			// to alert on it by level alone.
			// eslint-disable-next-line no-console
			console.error(
				"[api:auth:login] rate limit unavailable, failing open",
				error
			)
		}
	}

	let body: unknown

	try {
		body = await request.json()
	} catch {
		// Routine client-bug signal (peer of the schema-validation warn below);
		// warn so it doesn't dominate the error log under botnet probing.
		// eslint-disable-next-line no-console
		console.warn("[api:auth:login] invalid JSON body")

		return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
	}

	const parsed = loginSchema.safeParse(body)

	if (!parsed.success) {
		// Log issue paths only (never values) so a real client bug is debuggable
		// without leaking submitted credentials into the access log.
		const issuePaths = parsed.error.issues
			.map((issue) => issue.path.join("."))
			.join(", ")
		// eslint-disable-next-line no-console
		console.warn(`[api:auth:login] schema validation failed: ${issuePaths}`)

		return NextResponse.json(
			{ error: "Missing email or password" },
			{ status: 400 }
		)
	}

	const { email, password } = parsed.data

	if (!(await verifyCredentials(email, password))) {
		// Logs the attempt (not the credentials) so repeated failures are visible
		// without leaking secrets. The key is the HMAC pseudonym when the secret
		// is configured and the literal "global" fallback otherwise — never a
		// raw IP — so failures always correlate with the rate-limit lines above
		// and the payload shape stays constant. Warn (not error) for the same
		// reason as the rate-limit demotion: credential stuffing is a routine
		// adversarial signal that would otherwise dominate the error log under
		// any sustained probe.
		// eslint-disable-next-line no-console
		console.warn("[api:auth:login] invalid credentials", { key })

		return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
	}

	await createSession()
	// Audit log for successful logins. Failed attempts log above; without this,
	// the access log can't answer "did the legitimate user log in at 3am".
	// eslint-disable-next-line no-console
	console.info("[api:auth:login] success")

	return NextResponse.json({ ok: true })
}
