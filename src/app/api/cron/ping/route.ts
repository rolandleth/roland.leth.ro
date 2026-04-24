import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"

// `Redis.fromEnv()` needs BOTH `KV_REST_API_TOKEN` and `KV_REST_API_URL`; a
// truthy check on just the token would let `fromEnv()` throw at module load
// when the URL is missing, which produces an unhelpful startup failure rather
// than the documented "no-Redis" fallback path.
const hasRedis = Boolean(
	process.env.KV_REST_API_TOKEN && process.env.KV_REST_API_URL
)
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
