"use client"

import { MotionConfig } from "framer-motion"

/**
 * Makes every Framer Motion animation in the app honour
 * `prefers-reduced-motion`. Wraps the whole tree, so it covers `fadeUp`
 * entrances and one-off animations alike.
 *
 * Framer defaults `reducedMotion` to `"never"` — motion components ignore the
 * OS preference until something opts in. `"user"` swaps the transition for an
 * instant one on positional keys (`x`/`y`/`scale`/`rotate`/`width`/`height`) and
 * leaves `opacity` animating, which is the behaviour the preference asks for:
 * movement removed, cross-fades kept.
 *
 * Deliberately global rather than per-component: a component that forgets to
 * call `useReducedMotion()` is silently unprotected, and nothing fails to
 * announce it. `MotionPreferences.test.tsx` asserts the config still reaches
 * the tree.
 *
 * It also leaves the server render alone. `initial` is unchanged, so the
 * prerendered inline styles match what the client renders — a variant that
 * dropped `initial` for reduced-motion visitors would hydrate against markup
 * that disagrees with it.
 */
export default function MotionPreferences({
	children,
}: {
	children: React.ReactNode
}) {
	return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
