import { vi } from "vitest"

/**
 * Factory for the shared `next/cache` mock, suitable as the second arg to
 * `vi.mock("next/cache", nextCacheMockFactory)`. Passes `unstable_cache` and
 * `cache` through as identity and exposes `revalidateTag` as a spy so callers
 * can assert invalidations.
 *
 * Must be a function (not a top-level constant) because `vi.mock` is hoisted
 * above imports — a captured reference to a module-level object would be
 * accessed before initialization at mock-factory time.
 */
export function nextCacheMockFactory() {
	return {
		unstable_cache: <T>(fn: T): T => fn,
		revalidateTag: vi.fn(),
		cache: <T>(fn: T): T => fn,
	}
}

/**
 * Spy variant of `nextCacheMockFactory` for tests that need to assert the
 * `keys` / `options.tags` arguments passed into `unstable_cache`. Behaves like
 * the identity-passthrough factory for the wrapped function, but captures the
 * call args so callers can assert on tag/key wiring without running the real
 * cache machinery.
 */
export function nextCacheSpyFactory() {
	const unstable_cache = vi.fn(<T>(fn: T): T => fn)

	return {
		unstable_cache,
		revalidateTag: vi.fn(),
		cache: <T>(fn: T): T => fn,
	}
}

/**
 * Caching variant that memoizes fulfilled results per `keys` join, matching the
 * real data cache's store-only-on-success behavior: a callback that resolves is
 * stored and never re-run for that key; a callback that THROWS stores nothing,
 * so the next call runs it again. For tests asserting the miss-not-cached
 * contract behind the 2026-07 stale-404 incident.
 *
 * The store lives for the whole test file (the factory runs once per
 * `vi.mock`), so tests sharing it must use distinct slugs to avoid key
 * collisions. simplified: keyed by `keys` only, not call arguments — every
 * wrapped callback in this codebase closes over its inputs and takes none.
 */
export function nextCacheMemoFactory() {
	const store = new Map<string, unknown>()

	return {
		unstable_cache:
			(fn: (...args: unknown[]) => Promise<unknown>, keys?: string[]) =>
			async (...args: unknown[]) => {
				const key = (keys ?? []).join("|")

				if (store.has(key)) {
					return store.get(key)
				}

				const value = await fn(...args)
				store.set(key, value)

				return value
			},
		revalidateTag: vi.fn(),
		cache: <T>(fn: T): T => fn,
	}
}

/**
 * Factory that preserves everything from the real `react` module but swaps
 * `cache` for a pass-through. Pass this to `vi.mock("react", reactCachePassthroughFactory)`.
 */
export async function reactCachePassthroughFactory(
	importOriginal: () => Promise<unknown>
): Promise<Record<string, unknown>> {
	const actual = (await importOriginal()) as Record<string, unknown>

	return { ...actual, cache: <T>(fn: T): T => fn }
}
