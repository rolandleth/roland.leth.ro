import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"
import { verifyCredentials, createSession } from "@/lib/auth"
import { getRedisConfig } from "@/lib/env"
import { loginSchema } from "@/lib/schemas"

// Construct from the resolved config object so the abstraction in `env.ts`
// stays the single source of truth — `Redis.fromEnv()` would re-read
// `process.env` directly and silently desync if the var names ever change.
const redisConfig = getRedisConfig()
const ratelimit =
	redisConfig !== null
		? new Ratelimit({
				redis: new Redis(redisConfig),
				limiter: Ratelimit.slidingWindow(5, "15 m"),
				prefix: "rl:login",
			})
		: null

/**
 * Returns the best-effort client IP for rate-limit bucketing. Vercel sets
 * `x-forwarded-for` with a comma-separated list (leftmost is the original
 * client). Falls back to the literal string `"unknown"` so requests with no
 * forwarded header still bucket together (and don't piggyback on each other).
 */
function clientBucketKey(request: NextRequest): string {
	const forwarded = request.headers.get("x-forwarded-for")

	if (forwarded != null && forwarded !== "") {
		const first = forwarded.split(",")[0]?.trim()

		if (first !== undefined && first !== "") {
			return first
		}
	}

	return "unknown"
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	if (ratelimit) {
		// Per-IP keying replaces the previous single global bucket: a stale
		// botnet of 5 failed attempts/15min could otherwise lock the legitimate
		// admin out of the only public auth entry point. With per-IP buckets,
		// each origin gets its own 5/15min budget.
		const key = clientBucketKey(request)

		try {
			const { success } = await ratelimit.limit(key)

			if (!success) {
				// eslint-disable-next-line no-console
				console.error("[api:auth:login] rate limit exceeded", { key })

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
		// eslint-disable-next-line no-console
		console.error("[api:auth:login] invalid JSON body")

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
		// without leaking secrets. Correlate spikes with rate-limit hits above.
		// eslint-disable-next-line no-console
		console.error("[api:auth:login] invalid credentials")

		return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
	}

	await createSession()
	// Audit log for successful logins. Failed attempts log above; without this,
	// the access log can't answer "did the legitimate user log in at 3am".
	// eslint-disable-next-line no-console
	console.info("[api:auth:login] success")

	return NextResponse.json({ ok: true })
}
