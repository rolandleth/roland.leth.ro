import type { Redis } from "@upstash/redis"

/**
 * Key written by both the scheduled cron (`/api/cron/ping`) and the manual
 * admin trigger (`/api/admin/keepalive`) to keep the Upstash free-tier DB out
 * of the idle-detector. Centralized so a future rename touches both routes at
 * once instead of silently desyncing.
 */
export const KEEPALIVE_KEY = "keepalive:last"

export type KeepaliveResult =
	| { ok: true; value: string }
	| { ok: false; error: unknown }

/**
 * Performs the shared Upstash write for the cron and admin keepalive routes:
 * stamps `KEEPALIVE_KEY` with the current ISO timestamp. Returns a
 * discriminated result so callers control their own logging tags, status
 * codes, and response shapes (cron returns 200 on no-Redis, admin returns
 * 503; both surface 502 on `redis.set` failure but log under different tags).
 *
 * The original error is returned (not stringified) so callers can hand it to
 * `console.error` and get a usable stack trace.
 */
export async function writeKeepalive(redis: Redis): Promise<KeepaliveResult> {
	const value = new Date().toISOString()

	try {
		await redis.set(KEEPALIVE_KEY, value)

		return { ok: true, value }
	} catch (error) {
		return { ok: false, error }
	}
}
