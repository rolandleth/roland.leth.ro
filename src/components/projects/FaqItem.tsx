"use client"

import { motion, useReducedMotion } from "framer-motion"
import { useState } from "react"
import type { ReactNode } from "react"

const PANEL_TRANSITION = { duration: 0.25, ease: "easeOut" } as const

interface Props {
	id: number
	/**
	 * The button's content: the question and its open marker. The item is the
	 * `group/faq` and carries `data-open` while open, so the marker follows the
	 * state with `group-data-open/faq:` variants.
	 */
	question: ReactNode
	/** The rendered answer. */
	children: ReactNode
	className?: string
	headingClassName?: string
	buttonClassName: string
	/** The box inside the animated panel, so its padding isn't animated away. */
	answerClassName: string
}

/**
 * One FAQ question and its answer, shared by the tabbed project layout
 * (`ProjectFaq`) and the product page (`ProductFaq`), which differ only in how
 * they look. Each question opens on its own, so several can be open at once.
 *
 * The answer is always rendered, so it's in the server HTML for search engines
 * and AI answer engines; a closed one is only collapsed. `inert` and
 * `aria-hidden` take a closed answer out of the tab order and the accessibility
 * tree, as a native `<details>` would. Framer measures the height it opens to,
 * which CSS can only do in Chromium; the cost is that an answer can't open
 * without JavaScript, and find-in-page can't open a closed one. Readers who ask
 * for less motion get it open and closed at once.
 */
export default function FaqItem({
	id,
	question,
	children,
	className = "",
	headingClassName,
	buttonClassName,
	answerClassName,
}: Props) {
	const [isOpen, setIsOpen] = useState(false)
	const prefersReducedMotion = useReducedMotion()
	const buttonId = `faq-button-${id}`
	const panelId = `faq-panel-${id}`

	return (
		<div
			className={`group/faq ${className}`}
			data-open={isOpen ? "" : undefined}
		>
			<h3 className={headingClassName}>
				<button
					type="button"
					id={buttonId}
					aria-expanded={isOpen}
					aria-controls={panelId}
					onClick={() => setIsOpen((wasOpen) => !wasOpen)}
					className={buttonClassName}
				>
					{question}
				</button>
			</h3>

			<motion.div
				id={panelId}
				role="region"
				aria-labelledby={buttonId}
				aria-hidden={!isOpen}
				inert={!isOpen}
				initial={false}
				animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
				transition={
					prefersReducedMotion === true ? { duration: 0 } : PANEL_TRANSITION
				}
				className="overflow-hidden"
			>
				<div className={answerClassName}>{children}</div>
			</motion.div>
		</div>
	)
}
