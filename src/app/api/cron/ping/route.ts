import { timingSafeEqual } from "node:crypto"
import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"
import { getCronSecret, getRedisConfig } from "@/lib/env"

export const KEEPALIVE_KEY = "keepalive:last"

// Construct from the resolved config object so the abstraction in `env.ts`
// stays the single source of truth — `Redis.fromEnv()` would re-read
// `process.env` directly and silently desync if the var names ever change.
const redisConfig = getRedisConfig()
const redis = redisConfig !== null ? new Redis(redisConfig) : null

function isAuthorized(auth: string | null, expected: string): boolean {
	const expectedBuf = Buffer.from(`Bearer ${expected}`)
	const authBuf = Buffer.from(auth ?? "")

	// `timingSafeEqual` requires equal-length buffers; the length check leaks
	// the expected length but that's unavoidable and acceptable for a server-
	// configured secret. Always run the compare against a same-length dummy
	// when lengths differ so the byte-level work is constant-time.
	if (authBuf.length !== expectedBuf.length) {
		timingSafeEqual(expectedBuf, expectedBuf)

		return false
	}

	return timingSafeEqual(authBuf, expectedBuf)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
	const expected = getCronSecret()

	if (expected === null) {
		// Silent 500s here would let the keepalive cron quietly stop working after
		// an env-var regression; logging the cause makes it visible in Vercel logs.
		// eslint-disable-next-line no-console
		console.error("[api:cron:ping] CRON_SECRET not configured")

		return NextResponse.json(
			{ error: "CRON_SECRET not configured" },
			{ status: 500 }
		)
	}

	if (!isAuthorized(request.headers.get("authorization"), expected)) {
		// eslint-disable-next-line no-console
		console.error("[api:cron:ping] unauthorized")

		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	if (!redis) {
		return NextResponse.json({ ok: true })
	}

	try {
		// `PING` is excluded from Upstash's idle-database detector, so a real data
		// command is required to keep the free-tier DB from being flagged inactive.
		// `SET keepalive:last <iso>` doubles as an observable "last successful run"
		// marker visible in the Upstash data browser.
		await redis.set(KEEPALIVE_KEY, new Date().toISOString())
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error("[api:cron:ping] redis.set() failed", error)

		return NextResponse.json(
			{ error: "Redis keepalive failed" },
			{ status: 502 }
		)
	}

	return NextResponse.json({ ok: true })
}
