import { isBackForwardNavigation } from "@/lib/client/navigationType"
import type { Transition } from "framer-motion"

/**
 * Returns Framer Motion spread props for a fade + vertical slide-in animation.
 * Positive `y` slides up from below; negative slides down from above.
 *
 * When the current render follows a browser back/forward navigation, `initial`
 * is `false` so Framer renders straight in the resolved state — returning to a
 * page shouldn't replay its entrance.
 *
 * Reduced motion is deliberately *not* handled here. `<MotionPreferences>`
 * (src/components/MotionPreferences.tsx) wraps the app in Framer's
 * `reducedMotion="user"`, which drops the `y` slide and keeps the opacity fade
 * for every motion component, not only this factory's callers. Reading the
 * preference here would also mean returning a different `initial` on the client
 * than the prerender produced.
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
