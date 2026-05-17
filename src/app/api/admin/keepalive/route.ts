import { NextResponse } from "next/server"
import { getKeepaliveRedis, writeKeepalive } from "@/lib/keepalive"

// Session-gated by `src/proxy.ts` (every `/api/admin/*` request requires a
// valid JWT cookie). Mirrors the cron route's write so an admin can confirm
// from the dashboard that the Upstash keepalive path is actually working
// without waiting for the next 00:00 UTC tick.
const redis = getKeepaliveRedis()

export async function POST(): Promise<NextResponse> {
	if (!redis) {
		// Hard config gap: the admin clicked the button but the server has no
		// Redis to talk to. Surface as 503 (service unavailable) rather than
		// 200/ok so the button can show a real error instead of silently
		// pretending it worked.
		return NextResponse.json(
			{ error: "Redis is not configured on this deploy" },
			{ status: 503 }
		)
	}

	const result = await writeKeepalive(redis)

	if (!result.ok) {
		// eslint-disable-next-line no-console
		console.error("[api:admin:keepalive] redis.set() failed", result.error)

		return NextResponse.json(
			{ error: "Redis keepalive failed" },
			{ status: 502 }
		)
	}

	// Audit trail so a manual trigger is distinguishable from the scheduled
	// cron in the logs (the cron route doesn't emit a success line; if it
	// ever starts, both lines together answer "who wrote this timestamp").
	// eslint-disable-next-line no-console
	console.info("[api:admin:keepalive] success", { value: result.value })

	return NextResponse.json({ ok: true, value: result.value })
}
