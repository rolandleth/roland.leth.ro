import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useOrderedList, type OrderedItem } from "./useOrderedList"

interface Item extends OrderedItem {
	label: string
}

function makeItem(partial: Partial<Item> = {}): Item {
	return {
		_key: partial._key ?? crypto.randomUUID(),
		sortOrder: partial.sortOrder ?? 0,
		label: partial.label ?? "x",
	}
}

// #region add

describe("useOrderedList add", () => {
	it("appends an item at the next sortOrder, with a generated _key", () => {
		const value = [makeItem({ _key: "a", label: "Alpha", sortOrder: 0 })]
		const onChange = vi.fn<(next: Item[]) => void>()

		const { result } = renderHook(() => useOrderedList<Item>(value, onChange))
		act(() => {
			result.current.add(() => ({ label: "Beta" }))
		})

		const next = onChange.mock.calls[0][0]
		expect(next).toHaveLength(2)
		expect(next[1]).toMatchObject({ label: "Beta", sortOrder: 1 })
		expect(typeof next[1]._key).toBe("string")
	})
})

// #endregion

// #region update

describe("useOrderedList update", () => {
	it("merges a partial patch into the targeted index, leaving siblings untouched", () => {
		const value = [
			makeItem({ _key: "a", label: "Alpha" }),
			makeItem({ _key: "b", label: "Beta" }),
		]
		const onChange = vi.fn<(next: Item[]) => void>()

		const { result } = renderHook(() => useOrderedList<Item>(value, onChange))
		act(() => {
			result.current.update(0, { label: "Alpha!" })
		})

		const next = onChange.mock.calls[0][0]
		expect(next[0].label).toBe("Alpha!")
		expect(next[1].label).toBe("Beta")
		// `_key` and `sortOrder` are preserved across update.
		expect(next[0]._key).toBe("a")
	})

	it("preserves sortOrder across update (regression guard)", () => {
		const value = [
			makeItem({ _key: "a", label: "Alpha", sortOrder: 7 }),
			makeItem({ _key: "b", label: "Beta", sortOrder: 8 }),
		]
		const onChange = vi.fn<(next: Item[]) => void>()

		const { result } = renderHook(() => useOrderedList<Item>(value, onChange))
		act(() => {
			result.current.update(0, { label: "Alpha!" })
		})

		const next = onChange.mock.calls[0][0]
		expect(next[0].sortOrder).toBe(7)
		expect(next[1].sortOrder).toBe(8)
	})

	it("leaves the list intact when the index is out of range", () => {
		const value = [makeItem({ _key: "a", label: "Alpha" })]
		const onChange = vi.fn<(next: Item[]) => void>()

		const { result } = renderHook(() => useOrderedList<Item>(value, onChange))
		act(() => {
			result.current.update(99, { label: "Ghost" })
		})

		const next = onChange.mock.calls[0][0]
		expect(next).toHaveLength(1)
		expect(next[0].label).toBe("Alpha")
	})
})

// #endregion

// #region remove

describe("useOrderedList remove", () => {
	it("removes the targeted item and compacts sortOrder back to dense 0..n-1", () => {
		const value = [
			makeItem({ _key: "a", label: "Alpha", sortOrder: 0 }),
			makeItem({ _key: "b", label: "Beta", sortOrder: 1 }),
			makeItem({ _key: "c", label: "Charlie", sortOrder: 2 }),
		]
		const onChange = vi.fn<(next: Item[]) => void>()

		const { result } = renderHook(() => useOrderedList<Item>(value, onChange))
		act(() => {
			result.current.remove(1)
		})

		const next = onChange.mock.calls[0][0]
		expect(next.map((i) => i.label)).toEqual(["Alpha", "Charlie"])
		expect(next.map((i) => i.sortOrder)).toEqual([0, 1])
	})

	it("no-ops when the index is out of range", () => {
		const value = [makeItem({ _key: "a", label: "Alpha", sortOrder: 0 })]
		const onChange = vi.fn<(next: Item[]) => void>()

		const { result } = renderHook(() => useOrderedList<Item>(value, onChange))
		act(() => {
			result.current.remove(99)
		})

		const next = onChange.mock.calls[0][0]
		expect(next.map((i) => i.label)).toEqual(["Alpha"])
		expect(next.map((i) => i.sortOrder)).toEqual([0])
	})
})

// #endregion

// #region move

describe("useOrderedList move", () => {
	it("swaps with the neighbor in the requested direction", () => {
		const value = [
			makeItem({ _key: "a", label: "Alpha", sortOrder: 0 }),
			makeItem({ _key: "b", label: "Beta", sortOrder: 1 }),
		]
		const onChange = vi.fn<(next: Item[]) => void>()

		const { result } = renderHook(() => useOrderedList<Item>(value, onChange))
		act(() => {
			result.current.move(1, "up")
		})

		const next = onChange.mock.calls[0][0]
		expect(next.map((i) => i.label)).toEqual(["Beta", "Alpha"])
		expect(next.map((i) => i.sortOrder)).toEqual([0, 1])
	})

	it("does not crash on out-of-bounds direction (last item moving down)", () => {
		const value = [makeItem({ _key: "a", sortOrder: 0 })]
		const onChange = vi.fn<(next: Item[]) => void>()

		const { result } = renderHook(() => useOrderedList<Item>(value, onChange))
		act(() => {
			result.current.move(0, "down")
		})

		// The reorder helper returns a clone of the original list when the move
		// would go out of bounds; the value is unchanged but onChange still fires.
		expect(onChange).toHaveBeenCalledOnce()
		expect(onChange.mock.calls[0][0]).toHaveLength(1)
	})
})

// #endregion
