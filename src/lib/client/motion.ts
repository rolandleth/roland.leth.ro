import { isBackForwardNavigation } from "@/lib/client/navigationType"
import type { Transition } from "framer-motion"

/**
 * Shows `fadeUp` content to a visitor without JavaScript. The root layout puts
 * it in its `<noscript>` style: a stylesheet `!important` beats the inline
 * `opacity: 0` the prerender writes, which nothing else would ever lift.
 */
export const NO_SCRIPT_FADE_RULE =
	"[data-fade]{opacity:1!important;transform:none!important}"

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
 *
 * The prerender writes `initial` as an inline `opacity: 0`, and only the
 * client's animation lifts it. `data-fade` marks the element for
 * `NO_SCRIPT_FADE_RULE`, which shows it to a visitor without JavaScript.
 */
export function fadeUp(
	delay: number,
	y = -12
): {
	initial: false | { opacity: number; y: number }
	animate: { opacity: number; y: number }
	transition: Transition
	"data-fade": true
} {
	return {
		initial: isBackForwardNavigation() ? false : { opacity: 0, y },
		animate: { opacity: 1, y: 0 },
		transition: { duration: 0.3, delay, ease: "easeOut" },
		"data-fade": true,
	}
}
