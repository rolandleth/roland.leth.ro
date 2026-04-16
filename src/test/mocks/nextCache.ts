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
 * Factory that preserves everything from the real `react` module but swaps
 * `cache` for a pass-through. Pass this to `vi.mock("react", reactCachePassthroughFactory)`.
 */
export async function reactCachePassthroughFactory(
	importOriginal: () => Promise<unknown>
): Promise<Record<string, unknown>> {
	const actual = (await importOriginal()) as Record<string, unknown>

	return { ...actual, cache: <T>(fn: T): T => fn }
}
