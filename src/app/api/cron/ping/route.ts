import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"

const hasRedis = process.env.KV_REST_API_TOKEN
const redis = hasRedis ? Redis.fromEnv() : null

export async function GET(request: NextRequest): Promise<NextResponse> {
	const expected = process.env.CRON_SECRET

	if (!expected) {
		// Silent 500s here would let the keepalive cron quietly stop working after
		// an env-var regression; logging the cause makes it visible in Vercel logs.
		// eslint-disable-next-line no-console
		console.error("[api:cron:ping] CRON_SECRET not configured")

		return NextResponse.json(
			{ error: "CRON_SECRET not configured" },
			{ status: 500 }
		)
	}

	const auth = request.headers.get("authorization")

	if (auth !== `Bearer ${expected}`) {
		// eslint-disable-next-line no-console
		console.error("[api:cron:ping] unauthorized")

		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	if (!redis) {
		return NextResponse.json({ ok: true })
	}

	try {
		await redis.ping()
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error("[api:cron:ping] redis.ping() failed", error)

		return NextResponse.json({ error: "Redis ping failed" }, { status: 502 })
	}

	return NextResponse.json({ ok: true })
}
