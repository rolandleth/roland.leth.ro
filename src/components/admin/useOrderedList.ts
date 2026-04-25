"use client"

import { useCallback } from "react"
import { moveAndReorder, type Direction } from "@/lib/reorder"

export interface OrderedItem {
	_key: string
	sortOrder: number
}

export interface OrderedListActions<T> {
	add: (factory: () => Omit<T, "_key" | "sortOrder">) => void
	update: (
		index: number,
		updates: Partial<Omit<T, "_key" | "sortOrder">>
	) => void
	remove: (index: number) => void
	move: (index: number, direction: Direction) => void
}

/**
 * Hook for controlled lists of `{ _key, sortOrder, ... }` items where the parent
 * owns `value` and receives every change through `onChange`. Callers (`LinkManager`,
 * `SectionManager`, the per-section image list) all need the same four operations
 * with consistent `_key` (stable React identity) and `sortOrder` (0..n-1) handling.
 *
 * `add` accepts a factory so the caller controls the new item's domain fields
 * while the hook supplies the `_key` (via `crypto.randomUUID`) and the trailing
 * `sortOrder`. `update` merges a partial patch into the targeted index. `remove`
 * compacts `sortOrder` after deletion. `move` defers to `moveAndReorder`.
 *
 * Returned callbacks are stable across renders (`useCallback` over the value/
 * onChange refs) so memoized child rows don't re-render on unrelated state
 * changes.
 */
export function useOrderedList<T extends OrderedItem>(
	value: T[],
	onChange: (next: T[]) => void
): OrderedListActions<T> {
	const add = useCallback(
		(factory: () => Omit<T, "_key" | "sortOrder">) => {
			const fields = factory()
			const next: T = {
				...fields,
				_key: crypto.randomUUID(),
				sortOrder: value.length,
			} as T

			onChange([...value, next])
		},
		[value, onChange]
	)

	const update = useCallback(
		(index: number, updates: Partial<Omit<T, "_key" | "sortOrder">>) => {
			onChange(
				value.map((item, i) => (i === index ? { ...item, ...updates } : item))
			)
		},
		[value, onChange]
	)

	const remove = useCallback(
		(index: number) => {
			const next = value
				.filter((_, i) => i !== index)
				.map((item, i) => ({ ...item, sortOrder: i }))

			onChange(next)
		},
		[value, onChange]
	)

	const move = useCallback(
		(index: number, direction: Direction) => {
			onChange(moveAndReorder(value, index, direction))
		},
		[value, onChange]
	)

	return { add, update, remove, move }
}
