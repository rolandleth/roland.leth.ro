"use client"

import { useCallback } from "react"
import { moveAndReorder, type Direction } from "@/lib/utils/reorder"

export interface OrderedItem {
	_key: string
	sortOrder: number
}

/**
 * How a list reports a change: as a function of the latest list, never as a
 * finished array. A finished array is built from the list the caller saw when
 * it rendered, so a change that lands later (an image upload finishing) would
 * put back that old list and undo every edit made in the meantime.
 */
export type OrderedListChange<T> = (update: (previous: T[]) => T[]) => void

/** The fields a caller may patch: everything but the hook-owned identity and order. */
export type OrderedItemPatch<T> = Partial<Omit<T, "_key" | "sortOrder">>

export interface OrderedListActions<T> {
	add: (factory: () => Omit<T, "_key" | "sortOrder">) => void
	/**
	 * Merges a patch into the item with `key`. A function patch reads that
	 * item's latest state, for a nested list inside the item.
	 */
	update: (
		key: string,
		patch: OrderedItemPatch<T> | ((item: T) => OrderedItemPatch<T>)
	) => void
	remove: (key: string) => void
	move: (key: string, direction: Direction) => void
}

/**
 * Hook for controlled lists of `{ _key, sortOrder, ... }` items where the parent
 * owns the list and applies every change through `onChange`. Callers
 * (`LinkManager`, `SectionManager`, the per-section image list) all need the
 * same four operations with consistent `_key` (stable React identity) and
 * `sortOrder` (0..n-1) handling.
 *
 * Items are addressed by `_key`, not index, and every operation is applied to
 * the latest list. Together these make a stale callback safe: a handler
 * captured before a reorder or a removal still reaches the right item, and an
 * item that is gone by then is left alone instead of being written back.
 *
 * `add` accepts a factory so the caller controls the new item's domain fields
 * while the hook supplies the `_key` (via `crypto.randomUUID`, outside the
 * updater so a re-run updater doesn't mint a second key) and the trailing
 * `sortOrder`. `remove` compacts `sortOrder` after deletion. `move` defers to
 * `moveAndReorder`.
 */
export function useOrderedList<T extends OrderedItem>(
	onChange: OrderedListChange<T>
): OrderedListActions<T> {
	const add = useCallback(
		(factory: () => Omit<T, "_key" | "sortOrder">) => {
			const fields = factory()
			const key = crypto.randomUUID()

			onChange((previous) => [
				...previous,
				{ ...fields, _key: key, sortOrder: previous.length } as T,
			])
		},
		[onChange]
	)

	const update = useCallback(
		(
			key: string,
			patch: OrderedItemPatch<T> | ((item: T) => OrderedItemPatch<T>)
		) => {
			onChange((previous) =>
				previous.map((item) => {
					if (item._key !== key) {
						return item
					}

					const fields = typeof patch === "function" ? patch(item) : patch

					return { ...item, ...fields }
				})
			)
		},
		[onChange]
	)

	const remove = useCallback(
		(key: string) => {
			onChange((previous) =>
				previous
					.filter((item) => item._key !== key)
					.map((item, i) => ({ ...item, sortOrder: i }))
			)
		},
		[onChange]
	)

	const move = useCallback(
		(key: string, direction: Direction) => {
			onChange((previous) => {
				const index = previous.findIndex((item) => item._key === key)

				if (index === -1) {
					return previous
				}

				return moveAndReorder(previous, index, direction)
			})
		},
		[onChange]
	)

	return { add, update, remove, move }
}
