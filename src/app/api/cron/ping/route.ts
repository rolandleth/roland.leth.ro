import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cronAuth"
import { getKeepaliveRedis, writeKeepalive } from "@/lib/api/keepalive"

const redis = getKeepaliveRedis()

export async function GET(request: NextRequest): Promise<NextResponse> {
	const unauthorized = requireCronAuth(request, "[api:cron:ping]")

	if (unauthorized) {
		return unauthorized
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
