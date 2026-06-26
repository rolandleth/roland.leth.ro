import { useEffect, useState } from "react"
import type { RefObject } from "react"

interface ScrollOverflow {
	/** `true` when the scroller is scrolled away from its start edge. */
	canScrollStart: boolean
	/** `true` when more content remains past the end edge. */
	canScrollEnd: boolean
}

/**
 * Tracks whether a horizontally-scrollable element has hidden content on its
 * start (left) and/or end (right) edges, so callers can render an overflow
 * affordance only on the side that actually has more to show.
 *
 * Recomputes on scroll and on size changes (`ResizeObserver`) — the latter
 * covers the element gaining/losing overflow when the viewport or its content
 * changes without a scroll event firing.
 */
export function useScrollOverflow<T extends HTMLElement>(
	ref: RefObject<T | null>
): ScrollOverflow {
	const [overflow, setOverflow] = useState<ScrollOverflow>({
		canScrollStart: false,
		canScrollEnd: false,
	})

	useEffect(() => {
		const node = ref.current

		if (node === null) {
			return
		}

		function update() {
			const element = ref.current

			if (element === null) {
				return
			}

			const { scrollLeft, scrollWidth, clientWidth } = element
			// 1px tolerance absorbs sub-pixel rounding so the end fade doesn't
			// linger when the scroller is effectively at its end.
			const maxScroll = scrollWidth - clientWidth
			const canScrollStart = scrollLeft > 1
			const canScrollEnd = scrollLeft < maxScroll - 1

			// Bail out when nothing changed so a scroll event that doesn't cross an
			// edge threshold (the common case) doesn't trigger a re-render.
			setOverflow((prev) =>
				prev.canScrollStart === canScrollStart &&
				prev.canScrollEnd === canScrollEnd
					? prev
					: { canScrollStart, canScrollEnd }
			)
		}

		update()
		node.addEventListener("scroll", update, { passive: true })

		const observer = new ResizeObserver(update)
		observer.observe(node)

		return () => {
			node.removeEventListener("scroll", update)
			observer.disconnect()
		}
	}, [ref])

	return overflow
}
