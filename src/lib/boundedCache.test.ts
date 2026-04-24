import { describe, expect, it, vi } from "vitest"
import { createBoundedWrapperCache } from "./boundedCache"

// #region reuse

describe("createBoundedWrapperCache", () => {
	it("returns the same instance on repeat gets for the same key", () => {
		const cache = createBoundedWrapperCache<{ id: number }>()
		const create = vi.fn(() => ({ id: 1 }))

		const first = cache.get("a", create)
		const second = cache.get("a", create)

		expect(second).toBe(first)
		expect(create).toHaveBeenCalledTimes(1)
	})

	it("builds a distinct instance per key", () => {
		const cache = createBoundedWrapperCache<{ key: string }>()

		const a = cache.get("a", () => ({ key: "a" }))
		const b = cache.get("b", () => ({ key: "b" }))

		expect(a).not.toBe(b)
		expect(a.key).toBe("a")
		expect(b.key).toBe("b")
	})
})

// #endregion

// #region eviction

describe("createBoundedWrapperCache eviction", () => {
	it("evicts the oldest entry once max is exceeded", () => {
		const cache = createBoundedWrapperCache<string>(2)
		const createA = vi.fn(() => "a")

		cache.get("a", createA)
		cache.get("b", () => "b")
		// Third insertion pushes out the oldest ("a").
		cache.get("c", () => "c")

		// Re-getting "a" rebuilds it (cache miss).
		cache.get("a", createA)
		expect(createA).toHaveBeenCalledTimes(2)
	})

	it("preserves hot keys via LRU touch on hit", () => {
		const cache = createBoundedWrapperCache<string>(2)
		const createA = vi.fn(() => "a")

		cache.get("a", createA)
		cache.get("b", () => "b")
		// Touch "a" so it becomes most-recent; "b" is now oldest.
		cache.get("a", createA)
		// Insert "c" — "b" gets evicted, "a" survives.
		cache.get("c", () => "c")

		// "a" is still cached: factory was called only on the first insert.
		cache.get("a", createA)
		expect(createA).toHaveBeenCalledTimes(1)
	})
})

// #endregion
