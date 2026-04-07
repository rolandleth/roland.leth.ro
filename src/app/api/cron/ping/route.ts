import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest): Promise<NextResponse> {
	const expected = process.env.CRON_SECRET

	if (expected) {
		const auth = request.headers.get("authorization")

		if (auth !== `Bearer ${expected}`) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
		}
	}

	if (!process.env.UPSTASH_REDIS_REDIS_URL) {
		return NextResponse.json({ ok: true })
	}

	const redis = Redis.fromEnv()
	await redis.ping()

	return NextResponse.json({ ok: true })
}
