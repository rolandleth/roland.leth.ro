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

export async function POST(request: NextRequest): Promise<NextResponse> {
	if (ratelimit) {
		// Global key — this is a single-user site; IP-based limits can be spoofed.
		const { success } = await ratelimit.limit("global")

		if (!success) {
			// eslint-disable-next-line no-console
			console.error("[api:auth:login] rate limit exceeded")

			return NextResponse.json({ error: "Too many requests" }, { status: 429 })
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
		// eslint-disable-next-line no-console
		console.error("[api:auth:login] schema validation failed")

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
