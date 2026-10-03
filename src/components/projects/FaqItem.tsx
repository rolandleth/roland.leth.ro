"use client"

import { useState } from "react"
import CollapsiblePanel from "@/components/ui/CollapsiblePanel"
import type { ReactNode } from "react"

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
 * The answer opens in a `CollapsiblePanel`: always in the HTML, animated by
 * height, closed to assistive tech while closed. Find-in-page can't open a
 * closed answer, as it could a `<details>`.
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

			<CollapsiblePanel
				isOpen={isOpen}
				id={panelId}
				labelledBy={buttonId}
				className={answerClassName}
			>
				{children}
			</CollapsiblePanel>
		</div>
	)
}
