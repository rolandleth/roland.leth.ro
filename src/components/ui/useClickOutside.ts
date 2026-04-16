import { useEffect } from "react"
import type { RefObject } from "react"

export function useClickOutside<T extends HTMLElement>(
	ref: RefObject<T | null>,
	onOutside: (event: MouseEvent) => void,
	enabled: boolean = true
): void {
	useEffect(() => {
		if (!enabled) {
			return
		}

		function handleMouseDown(event: MouseEvent) {
			const node = ref.current

			if (node === null) {
				return
			}

			if (node.contains(event.target as Node)) {
				return
			}

			onOutside(event)
		}

		document.addEventListener("mousedown", handleMouseDown)

		return () => document.removeEventListener("mousedown", handleMouseDown)
	}, [ref, onOutside, enabled])
}
