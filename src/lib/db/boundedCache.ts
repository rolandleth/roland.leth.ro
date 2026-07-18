const DEFAULT_MAX_ENTRIES = 256

/** A bounded, string-keyed cache of factory-built values. */
export type BoundedWrapperCache<T> = {
	get(key: string, create: () => T): T
}

/**
 * Creates a bounded LRU-style cache of factory-built values keyed by string.
 * Used to memoize per-slug `unstable_cache` wrappers so each key keeps its own
 * cache tag without rebuilding the wrapper on every call, while capping total
 * entries to prevent unbounded growth from 404 probes or arbitrary URL input.
 *
 * Eviction: FIFO by insertion order once `max` is exceeded. On hit, the key is
 * re-inserted to move it to the most-recent end of the iteration order, so hot
 * keys survive eviction (LRU touch).
 */
export function createBoundedWrapperCache<T>(
	max: number = DEFAULT_MAX_ENTRIES
): BoundedWrapperCache<T> {
	const map = new Map<string, T>()

	return {
		get(key, create) {
			const existing = map.get(key)

			if (existing != null) {
				// LRU touch: re-insert to move to most-recent position.
				map.delete(key)
				map.set(key, existing)

				return existing
			}

			const value = create()
			map.set(key, value)

			if (map.size > max) {
				const oldestKey = map.keys().next().value

				if (oldestKey != null) {
					map.delete(oldestKey)
				}
			}

			return value
		},
	}
}
