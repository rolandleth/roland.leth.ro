import { useEffect, useState } from "react"
import type { RefObject } from "react"

export interface ElementSize {
	width: number
	height: number
}

/**
 * Tracks an element's rendered pixel size, updating on any resize
 * (`ResizeObserver`). The gallery needs the stage width to translate the slide
 * track by whole viewports, and the lightbox needs both dimensions to clamp a
 * zoomed image's pan to its edges.
 *
 * Starts at `{ 0, 0 }` before the first measurement; callers must tolerate a
 * zero size for the first paint (the track simply sits at its first slide).
 */
export function useElementSize<T extends HTMLElement>(
	ref: RefObject<T | null>
): ElementSize {
	const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })

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

			const { width, height } = element.getBoundingClientRect()

			// Skip the state write when nothing changed so a resize that doesn't
			// alter the box (the common case) doesn't trigger a re-render.
			setSize((prev) =>
				prev.width === width && prev.height === height
					? prev
					: { width, height }
			)
		}

		update()

		const observer = new ResizeObserver(update)
		observer.observe(node)

		return () => observer.disconnect()
	}, [ref])

	return size
}
