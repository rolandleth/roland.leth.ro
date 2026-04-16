import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"

const hasRedis = process.env.KV_REST_API_TOKEN
const redis = hasRedis ? Redis.fromEnv() : null

export async function GET(request: NextRequest): Promise<NextResponse> {
	const expected = process.env.CRON_SECRET

	if (!expected) {
		return NextResponse.json(
			{ error: "CRON_SECRET not configured" },
			{ status: 500 }
		)
	}

	const auth = request.headers.get("authorization")

	if (auth !== `Bearer ${expected}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	if (!redis) {
		return NextResponse.json({ ok: true })
	}

	await redis.ping()

	return NextResponse.json({ ok: true })
}
