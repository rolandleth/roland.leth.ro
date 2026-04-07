import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"
import { verifyCredentials, createSession } from "@/lib/auth"

const hasRedis = process.env.REDIS_URL

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

	if (
		typeof body !== "object" ||
		body === null ||
		typeof (body as Record<string, unknown>).email !== "string" ||
		typeof (body as Record<string, unknown>).password !== "string"
	) {
		return NextResponse.json(
			{ error: "Missing email or password" },
			{ status: 400 }
		)
	}

	const { email, password } = body as { email: string; password: string }

	if (!(await verifyCredentials(email, password))) {
		return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
	}

	await createSession()
	return NextResponse.json({ ok: true })
}
