import { describe, expect, it } from "vitest"
import { moveAndReorder } from "@/lib/reorder"

function makeList(length: number) {
	return Array.from({ length }, (_, i) => ({ id: i, sortOrder: i }))
}

describe("moveAndReorder", () => {
	it("moves an item up by one position", () => {
		const list = makeList(3)
		const result = moveAndReorder(list, 1, "up")
		expect(result.map((item) => item.id)).toEqual([1, 0, 2])
	})

	it("moves an item down by one position", () => {
		const list = makeList(3)
		const result = moveAndReorder(list, 1, "down")
		expect(result.map((item) => item.id)).toEqual([0, 2, 1])
	})

	it("reassigns sortOrder by position after a move", () => {
		const list = makeList(4)
		const result = moveAndReorder(list, 2, "up")
		expect(result.map((item) => item.sortOrder)).toEqual([0, 1, 2, 3])
	})

	it("preserves sortOrder contiguity when the original list has gaps", () => {
		const list = [
			{ id: "a", sortOrder: 5 },
			{ id: "b", sortOrder: 10 },
			{ id: "c", sortOrder: 15 },
		]
		const result = moveAndReorder(list, 0, "down")
		expect(result.map((item) => item.id)).toEqual(["b", "a", "c"])
		expect(result.map((item) => item.sortOrder)).toEqual([0, 1, 2])
	})

	it("returns an equivalent list when moving the first item up", () => {
		const list = makeList(3)
		const result = moveAndReorder(list, 0, "up")
		expect(result.map((item) => item.id)).toEqual([0, 1, 2])
	})

	it("returns an equivalent list when moving the last item down", () => {
		const list = makeList(3)
		const result = moveAndReorder(list, 2, "down")
		expect(result.map((item) => item.id)).toEqual([0, 1, 2])
	})

	it("returns an equivalent list for an out-of-bounds index", () => {
		const list = makeList(3)
		const result = moveAndReorder(list, 99, "up")
		expect(result.map((item) => item.id)).toEqual([0, 1, 2])
	})

	it("returns an equivalent list for a negative index", () => {
		const list = makeList(3)
		const result = moveAndReorder(list, -1, "down")
		expect(result.map((item) => item.id)).toEqual([0, 1, 2])
	})

	it("does not mutate the input list", () => {
		const list = makeList(3)
		const snapshot = list.map((item) => ({ ...item }))
		moveAndReorder(list, 1, "up")
		expect(list).toEqual(snapshot)
	})

	it("handles a single-item list without changing it", () => {
		const list = [{ id: "only", sortOrder: 0 }]
		const result = moveAndReorder(list, 0, "up")
		expect(result).toEqual(list)
	})

	it("handles an empty list", () => {
		expect(moveAndReorder([], 0, "up")).toEqual([])
	})
})
