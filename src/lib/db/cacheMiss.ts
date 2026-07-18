import { unstable_cache } from "next/cache"
import type { BoundedWrapperCache } from "@/lib/db/boundedCache"

/**
 * Thrown inside an `unstable_cache` callback when the underlying row doesn't
 * exist. `unstable_cache` stores only fulfilled results, so throwing keeps the
 * miss out of the durable cache: a 404 heals on the next request instead of
 * being pinned until a tag bust reaches it (the 2026-07 stale-404 incident —
 * a post's detail page kept serving a cached `null` written before the row
 * existed). Costs one DB hit per request for a nonexistent slug, which
 * `createBoundedWrapperCache` already keeps bounded on the wrapper side.
 */
export class CacheMissError extends Error {
	constructor() {
		super("cache miss")
		this.name = "CacheMissError"
	}
}

/**
 * Runs a cached fetch, converting the deliberate `CacheMissError` signal back
 * into the `null` the lookup API promises. Any other error propagates.
 */
export async function nullOnCacheMiss<T>(
	fetchCached: () => Promise<T>
): Promise<T | null> {
	try {
		return await fetchCached()
	} catch (error) {
		if (error instanceof CacheMissError) {
			return null
		}

		throw error
	}
}

/**
 * Builds (or reuses) a per-key `unstable_cache` wrapper for a nullable detail
 * fetch, and resolves it to the row or `null`. Collapses the identical
 * "cache the row, throw `CacheMissError` on a miss, translate the throw back to
 * `null`" dance every detail lookup (post/project/guide/topic) would otherwise
 * repeat.
 *
 * `fetchRow` runs inside the cache and returns the fully-shaped row (do any
 * transform there) or `null` when the row doesn't exist; the miss is turned into
 * a throw so it's never pinned into the durable cache. Read-time filters that
 * depend on the current clock (scheduled posts/guides) belong at the call site,
 * on the resolved value — not in `fetchRow`, or they'd be frozen into the cache.
 */
export function wrapNullableDetail<T>(
	wrappers: BoundedWrapperCache<() => Promise<T>>,
	key: string,
	fetchRow: () => Promise<T | null>,
	keyParts: string[],
	tags: string[]
): Promise<T | null> {
	const wrapper = wrappers.get(key, () =>
		unstable_cache(
			async () => {
				const row = await fetchRow()

				if (row == null) {
					// Thrown, not returned: `unstable_cache` stores only fulfilled
					// results, so a miss is never pinned into the durable cache and a
					// 404 heals on the next request. See `CacheMissError`.
					throw new CacheMissError()
				}

				return row
			},
			keyParts,
			{ tags }
		)
	)

	return nullOnCacheMiss(wrapper)
}
