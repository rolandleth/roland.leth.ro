import { isBackForwardNavigation } from "@/lib/client/navigationType"
import type { Transition } from "framer-motion"

/**
 * Returns Framer Motion spread props for a fade + vertical slide-in animation.
 * Positive `y` slides up from below; negative slides down from above.
 *
 * When the current render follows a browser back/forward navigation, `initial`
 * is `false` so Framer renders straight in the resolved state — returning to a
 * page shouldn't replay its entrance.
 */
export function fadeUp(
	delay: number,
	y = -12
): {
	initial: false | { opacity: number; y: number }
	animate: { opacity: number; y: number }
	transition: Transition
} {
	return {
		initial: isBackForwardNavigation() ? false : { opacity: 0, y },
		animate: { opacity: 1, y: 0 },
		transition: { duration: 0.3, delay, ease: "easeOut" },
	}
}
