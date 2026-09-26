import { act, renderHook } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"
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

// The hook reports changes as updaters, so the tests hold the list in real
// state — the way `ProjectForm` does — and assert on what that state becomes.
function renderList(initial: Item[]) {
	return renderHook(() => {
		const [items, setItems] = useState(initial)

		return { items, actions: useOrderedList<Item>(setItems) }
	})
}

// #region add

describe("useOrderedList add", () => {
	it("appends an item at the next sortOrder, with a generated _key", () => {
		const { result } = renderList([
			makeItem({ _key: "a", label: "Alpha", sortOrder: 0 }),
		])

		act(() => {
			result.current.actions.add(() => ({ label: "Beta" }))
		})

		const { items } = result.current
		expect(items).toHaveLength(2)
		expect(items[1]).toMatchObject({ label: "Beta", sortOrder: 1 })
		expect(typeof items[1]._key).toBe("string")
		expect(items[1]._key).not.toBe("a")
	})
})

// #endregion

// #region update

describe("useOrderedList update", () => {
	it("merges a patch into the item with the key, leaving siblings untouched", () => {
		const { result } = renderList([
			makeItem({ _key: "a", label: "Alpha" }),
			makeItem({ _key: "b", label: "Beta" }),
		])

		act(() => {
			result.current.actions.update("b", { label: "Beta!" })
		})

		const { items } = result.current
		expect(items.map((i) => i.label)).toEqual(["Alpha", "Beta!"])
		expect(items[1]._key).toBe("b")
	})

	it("preserves sortOrder across update (regression guard)", () => {
		const { result } = renderList([
			makeItem({ _key: "a", label: "Alpha", sortOrder: 7 }),
			makeItem({ _key: "b", label: "Beta", sortOrder: 8 }),
		])

		act(() => {
			result.current.actions.update("a", { label: "Alpha!" })
		})

		expect(result.current.items.map((i) => i.sortOrder)).toEqual([7, 8])
	})

	it("passes a function patch the item's latest state", () => {
		const { result } = renderList([makeItem({ _key: "a", label: "Alpha" })])

		act(() => {
			result.current.actions.update("a", { label: "Alpha!" })
			result.current.actions.update("a", (item) => ({
				label: `${item.label}?`,
			}))
		})

		expect(result.current.items[0].label).toBe("Alpha!?")
	})

	it("leaves the list intact when no item has the key", () => {
		const { result } = renderList([makeItem({ _key: "a", label: "Alpha" })])

		act(() => {
			result.current.actions.update("ghost", { label: "Ghost" })
		})

		expect(result.current.items.map((i) => i.label)).toEqual(["Alpha"])
	})
})

// #endregion

// #region remove

describe("useOrderedList remove", () => {
	it("removes the item with the key and compacts sortOrder back to dense 0..n-1", () => {
		const { result } = renderList([
			makeItem({ _key: "a", label: "Alpha", sortOrder: 0 }),
			makeItem({ _key: "b", label: "Beta", sortOrder: 1 }),
			makeItem({ _key: "c", label: "Charlie", sortOrder: 2 }),
		])

		act(() => {
			result.current.actions.remove("b")
		})

		const { items } = result.current
		expect(items.map((i) => i.label)).toEqual(["Alpha", "Charlie"])
		expect(items.map((i) => i.sortOrder)).toEqual([0, 1])
	})

	it("no-ops when no item has the key", () => {
		const { result } = renderList([
			makeItem({ _key: "a", label: "Alpha", sortOrder: 0 }),
		])

		act(() => {
			result.current.actions.remove("ghost")
		})

		const { items } = result.current
		expect(items.map((i) => i.label)).toEqual(["Alpha"])
		expect(items.map((i) => i.sortOrder)).toEqual([0])
	})
})

// #endregion

// #region move

describe("useOrderedList move", () => {
	it("swaps with the neighbor in the requested direction", () => {
		const { result } = renderList([
			makeItem({ _key: "a", label: "Alpha", sortOrder: 0 }),
			makeItem({ _key: "b", label: "Beta", sortOrder: 1 }),
		])

		act(() => {
			result.current.actions.move("b", "up")
		})

		const { items } = result.current
		expect(items.map((i) => i.label)).toEqual(["Beta", "Alpha"])
		expect(items.map((i) => i.sortOrder)).toEqual([0, 1])
	})

	it("does not crash on out-of-bounds direction (last item moving down)", () => {
		const { result } = renderList([makeItem({ _key: "a", sortOrder: 0 })])

		act(() => {
			result.current.actions.move("a", "down")
		})

		expect(result.current.items.map((i) => i._key)).toEqual(["a"])
	})

	it("no-ops when no item has the key", () => {
		const { result } = renderList([
			makeItem({ _key: "a", label: "Alpha", sortOrder: 0 }),
			makeItem({ _key: "b", label: "Beta", sortOrder: 1 }),
		])

		act(() => {
			result.current.actions.move("ghost", "up")
		})

		expect(result.current.items.map((i) => i.label)).toEqual(["Alpha", "Beta"])
	})
})

// #endregion

// #region Stale callbacks

describe("useOrderedList with a callback captured before other edits", () => {
	it("keeps the later edits instead of restoring the list it was captured with", () => {
		const { result } = renderList([
			makeItem({ _key: "a", label: "Alpha", sortOrder: 0 }),
			makeItem({ _key: "b", label: "Beta", sortOrder: 1 }),
		])
		// What an upload's completion handler holds: the actions from the
		// render in which the file was picked.
		const captured = result.current.actions

		act(() => {
			result.current.actions.move("b", "up")
			result.current.actions.update("a", { label: "Alpha!" })
		})
		act(() => {
			captured.update("b", { label: "Beta!" })
		})

		const { items } = result.current
		expect(items.map((i) => i.label)).toEqual(["Beta!", "Alpha!"])
		expect(items.map((i) => i.sortOrder)).toEqual([0, 1])
	})

	it("drops the edit when its item was removed in the meantime", () => {
		const { result } = renderList([
			makeItem({ _key: "a", label: "Alpha", sortOrder: 0 }),
			makeItem({ _key: "b", label: "Beta", sortOrder: 1 }),
		])
		const captured = result.current.actions

		act(() => {
			result.current.actions.remove("b")
		})
		act(() => {
			captured.update("b", { label: "Beta!" })
		})

		expect(result.current.items.map((i) => i.label)).toEqual(["Alpha"])
	})
})

// #endregion
