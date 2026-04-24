import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"
import { verifyCredentials, createSession } from "@/lib/auth"
import { loginSchema } from "@/lib/schemas"

// `Redis.fromEnv()` (inside `Ratelimit`) needs BOTH vars. A truthy check on
// just the token would let module-load throw when URL is missing, which
// breaks the whole login route instead of falling back to "no rate limiting".
const hasRedis = Boolean(
	process.env.KV_REST_API_TOKEN && process.env.KV_REST_API_URL
)

const ratelimit = hasRedis
	? new Ratelimit({
			redis: Redis.fromEnv(),
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
	return NextResponse.json({ ok: true })
}
