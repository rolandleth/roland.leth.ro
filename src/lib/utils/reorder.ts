export type Direction = "up" | "down"

/**
 * Returns a new list with the item at `index` swapped with its neighbor in `direction`,
 * and every `sortOrder` reassigned by position so the list stays contiguous starting at 0.
 * Returns the list unchanged (but still a new array) when the move would go out of bounds.
 */
export function moveAndReorder<T extends { sortOrder: number }>(
	list: T[],
	index: number,
	direction: Direction
): T[] {
	if (index < 0 || index >= list.length) {
		return list.slice()
	}

	const targetIndex = direction === "up" ? index - 1 : index + 1

	if (targetIndex < 0 || targetIndex >= list.length) {
		return list.slice()
	}

	const next = list.slice()
	const [moved] = next.splice(index, 1)
	next.splice(targetIndex, 0, moved)

	return next.map((item, position) => ({ ...item, sortOrder: position }))
}
