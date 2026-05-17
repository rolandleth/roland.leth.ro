import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getCronSecret } from "@/lib/env"
import { getKeepaliveRedis, writeKeepalive } from "@/lib/keepalive"

const redis = getKeepaliveRedis()

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
		// Server config error: cron can't function. Log at error level so a
		// Vercel-side env regression is visible, but surface as 401 (not 500
		// naming the env var) to the unauthenticated caller — otherwise a
		// pre-auth probe learns the server is missing CRON_SECRET.
		// eslint-disable-next-line no-console
		console.error("[api:cron:ping] CRON_SECRET not configured")

		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	if (!isAuthorized(request.headers.get("authorization"), expected)) {
		// Routine adversarial signal (port scanners, stale cron config); warn
		// rather than error so a scan doesn't dominate the error log.
		// eslint-disable-next-line no-console
		console.warn("[api:cron:ping] unauthorized")

		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	if (!redis) {
		return NextResponse.json({ ok: true })
	}

	// `PING` is excluded from Upstash's idle-database detector, so a real data
	// command is required to keep the free-tier DB from being flagged inactive.
	// `writeKeepalive` performs the `SET keepalive:last <iso>` write that
	// doubles as an observable "last successful run" marker in the Upstash
	// data browser; the helper is shared with `/api/admin/keepalive`.
	const result = await writeKeepalive(redis)

	if (!result.ok) {
		// eslint-disable-next-line no-console
		console.error("[api:cron:ping] redis.set() failed", result.error)

		return NextResponse.json(
			{ error: "Redis keepalive failed" },
			{ status: 502 }
		)
	}

	// Positive heartbeat so an "alert if no cron success in N hours" check can
	// be a log grep instead of scraping Upstash. Mirrors the admin route's
	// success line; the two together answer "who wrote this timestamp".
	// eslint-disable-next-line no-console
	console.info("[api:cron:ping] success", { value: result.value })

	return NextResponse.json({ ok: true })
}
