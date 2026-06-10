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
 * Carries no IP, so it's safe to write to Upstash and the audit log.
 */
const globalBucketKey = "global"

/**
 * Returns the HMAC-pseudonymized client IP used as the rate-limit bucket key.
 * Vercel sets `x-forwarded-for` with a comma-separated list (leftmost is the
 * original client). Requests with no forwarded header bucket together under
 * the literal `"unknown"` so they don't piggyback on each other's budget.
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

	return createHmac("sha256", secret)
		.update(rawIp)
		.digest("base64url")
		.slice(0, 22)
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
	if (ratelimit) {
		// Per-IP keying when the HMAC secret is set, else a single shared bucket.
		// Per-IP avoids the previous global-bucket failure mode where a stale
		// botnet of 5 failed attempts/15min locks the legitimate admin out of the
		// only public auth entry point; the global fallback re-accepts that risk
		// when no secret is configured, as the lesser evil over no limiter at all.
		const key = bucketKey(request)

		try {
			const { success } = await ratelimit.limit(key)

			if (!success) {
				// Routine adversarial signal — a botnet hitting the limiter is
				// expected; warn rather than error so it doesn't dominate the
				// error log. Credential-misconfig and code bugs stay at error.
				// eslint-disable-next-line no-console
				console.warn("[api:auth:login] rate limit exceeded", { key })

				return NextResponse.json(
					{ error: "Too many requests" },
					{ status: 429 }
				)
			}
		} catch (error) {
			// Fail-open: a transient Upstash blip should not lock the admin out.
			// Logged so the operator can correlate auth failures with Redis health.
			// eslint-disable-next-line no-console
			console.warn(
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
		// without leaking secrets. When the HMAC secret is configured, include
		// the pseudonymized bucket key so failures can be correlated with the
		// rate-limit log above; omit it entirely otherwise rather than fall back
		// to a plain IP. Warn (not error) for the same reason as the rate-limit
		// demotion: credential stuffing is a routine adversarial signal that
		// would otherwise dominate the error log under any sustained probe.
		// eslint-disable-next-line no-console
		console.warn(
			"[api:auth:login] invalid credentials",
			ipHashSecret !== null
				? { key: clientBucketKey(request, ipHashSecret) }
				: {}
		)

		return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
	}

	await createSession()
	// Audit log for successful logins. Failed attempts log above; without this,
	// the access log can't answer "did the legitimate user log in at 3am".
	// eslint-disable-next-line no-console
	console.info("[api:auth:login] success")

	return NextResponse.json({ ok: true })
}
