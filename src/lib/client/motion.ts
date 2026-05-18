import type { Transition } from "framer-motion"

/**
 * Returns Framer Motion spread props for a fade + vertical slide-in animation.
 * Positive `y` slides up from below; negative slides down from above.
 */
export function fadeUp(
	delay: number,
	y = -12
): {
	initial: { opacity: number; y: number }
	animate: { opacity: number; y: number }
	transition: Transition
} {
	return {
		initial: { opacity: 0, y },
		animate: { opacity: 1, y: 0 },
		transition: { duration: 0.3, delay, ease: "easeOut" },
	}
}
