import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"
import { verifyCredentials, createSession } from "@/lib/auth"
import { loginSchema } from "@/lib/schemas"

const hasRedis = process.env.KV_REST_API_TOKEN

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
			return NextResponse.json({ error: "Too many requests" }, { status: 429 })
		}
	}

	let body: unknown

	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
	}

	const parsed = loginSchema.safeParse(body)

	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Missing email or password" },
			{ status: 400 }
		)
	}

	const { email, password } = parsed.data

	if (!(await verifyCredentials(email, password))) {
		return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
	}

	await createSession()
	return NextResponse.json({ ok: true })
}
