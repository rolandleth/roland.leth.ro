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
