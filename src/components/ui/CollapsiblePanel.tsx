"use client"

import { motion, useReducedMotion } from "framer-motion"
import type { ReactNode } from "react"

const TRANSITION = { duration: 0.25, ease: "easeOut" } as const

interface Props {
	isOpen: boolean
	/** The panel's id, for the `aria-controls` of the control that opens it. */
	id?: string
	/**
	 * The id of what names the panel. With it, the panel is a labelled region;
	 * without it (a decorative preview), just a box.
	 */
	labelledBy?: string
	/** The box inside the animated one, so its padding isn't animated away. */
	className?: string
	children: ReactNode
}

/**
 * Content that opens and closes by height, with a fade. Framer measures the
 * height it opens to, which CSS can only do in Chromium. The content is always
 * rendered, so it's in the server HTML for search engines; closed, it's only
 * collapsed, and `inert` and `aria-hidden` take it out of the tab order and the
 * accessibility tree, as a closed `<details>` would. The cost: it can't open
 * without JavaScript. Readers who ask for less motion get it open and closed
 * at once.
 */
export default function CollapsiblePanel({
	isOpen,
	id,
	labelledBy,
	className,
	children,
}: Props) {
	const prefersReducedMotion = useReducedMotion()

	return (
		<motion.div
			id={id}
			role={labelledBy == null ? undefined : "region"}
			aria-labelledby={labelledBy}
			aria-hidden={!isOpen}
			inert={!isOpen}
			initial={false}
			animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
			transition={prefersReducedMotion === true ? { duration: 0 } : TRANSITION}
			className="overflow-hidden"
		>
			<div className={className}>{children}</div>
		</motion.div>
	)
}
