import { Redis } from "@upstash/redis"
import { getRedisConfig } from "@/lib/auth/env"

/**
 * Key written by both the scheduled cron (`/api/cron/ping`) and the manual
 * admin trigger (`/api/admin/keepalive`) to keep the Upstash free-tier DB out
 * of the idle-detector. Centralized so a future rename touches both routes at
 * once instead of silently desyncing.
 */
export const KEEPALIVE_KEY = "keepalive:last"

// Three-state cache so a resolved-but-no-config result is cached too:
// `undefined` = not yet resolved, `null` = resolved-but-no-config, `Redis`
// instance = resolved-and-configured. Without the tri-state, a missing-config
// deploy would re-read `process.env` on every request.
let memoizedRedis: Redis | null | undefined

/**
 * Lazily resolves the Upstash client used for keepalive writes by both the
 * cron route and the admin keepalive route. Returns `null` when Redis isn't
 * configured (local dev, preview deploys without the binding) — callers
 * decide whether a missing client is a 200 no-op (cron) or a 503 error
 * (admin).
 *
 * Memoized so module-scope `const redis = getKeepaliveRedis()` in each route
 * yields a single instance per cold-start, matching the pre-extraction
 * `new Redis(...)` pattern. Lazy (rather than an eager `export const`) so
 * importing this module from a test or unrelated route doesn't pay the
 * construction cost on every cold start.
 */
export function getKeepaliveRedis(): Redis | null {
	if (memoizedRedis === undefined) {
		const config = getRedisConfig()
		memoizedRedis = config !== null ? new Redis(config) : null
	}

	return memoizedRedis
}

export type KeepaliveResult =
	{ ok: true; value: string } | { ok: false; error: Error }

/**
 * Performs the shared Upstash write for the cron and admin keepalive routes:
 * stamps `KEEPALIVE_KEY` with the current ISO timestamp. Returns a
 * discriminated result so callers control their own logging tags, status
 * codes, and response shapes (cron returns 200 on no-Redis, admin returns
 * 503; both surface 502 on `redis.set` failure but log under different tags).
 *
 * The error is normalised to a real `Error` instance at the helper boundary
 * so callers don't have to re-narrow `unknown` for `.stack`, and so a non-
 * `Error` throw (Upstash SDKs occasionally reject with a plain object)
 * doesn't print as `[object Object]` through `console.error`.
 */
export async function writeKeepalive(redis: Redis): Promise<KeepaliveResult> {
	const value = new Date().toISOString()

	try {
		await redis.set(KEEPALIVE_KEY, value)

		return { ok: true, value }
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error : new Error(String(error)),
		}
	}
}
