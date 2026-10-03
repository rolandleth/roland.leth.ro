"use client"

import { useState } from "react"
import CollapsiblePanel from "@/components/ui/CollapsiblePanel"
import type { ReactNode } from "react"

// The gallery's one section heading; the tiles and the cards have none.
const HEADING_CLASS =
	"text-primary font-serif text-[30px] leading-[1.15] font-normal tracking-[-0.015em]"

interface Props {
	id: string
	count: number
	/** The first row of icons, shown while closed; decorative. */
	preview: ReactNode
	/** The full list, grouped by platform. */
	children: ReactNode
	className?: string
}

/**
 * The open-and-close part of "More projects": the heading is the button,
 * with "Show all N" or "Hide" at its end. Opening collapses the preview row
 * and opens the full list, both by height (`CollapsiblePanel`), so the list
 * grows out of the row it previews.
 *
 * The count beside the heading is hidden from screen readers, which hear it in
 * "Show all N" instead.
 */
export default function MoreProjectsDisclosure({
	id,
	count,
	preview,
	children,
	className = "",
}: Props) {
	const [isOpen, setIsOpen] = useState(false)
	const titleId = `${id}-title`
	const listId = `${id}-list`

	return (
		<section id={id} aria-labelledby={titleId} className={className}>
			<h2 id={titleId} className={`m-0 ${HEADING_CLASS}`}>
				<button
					type="button"
					aria-expanded={isOpen}
					aria-controls={listId}
					onClick={() => setIsOpen((wasOpen) => !wasOpen)}
					className="flex w-full cursor-pointer items-center justify-between gap-6 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-[6px] focus-visible:outline-(--color-accent)"
				>
					<span className="flex items-baseline gap-3">
						More projects
						<span
							aria-hidden
							className="text-secondary font-sans text-[15px] tracking-normal"
						>
							{count}
						</span>
					</span>

					<span className="flex min-h-9 shrink-0 items-center gap-2 font-sans text-[15px] font-medium tracking-normal text-(--color-accent)">
						{isOpen ? "Hide" : `Show all ${count}`}
						<span
							aria-hidden
							className="w-5 text-center text-[22px] leading-none font-light"
						>
							{isOpen ? "−" : "+"}
						</span>
					</span>
				</button>
			</h2>

			<CollapsiblePanel isOpen={!isOpen} className="pt-6">
				{preview}
			</CollapsiblePanel>

			<CollapsiblePanel
				isOpen={isOpen}
				id={listId}
				labelledBy={titleId}
				className="pt-6"
			>
				{children}
			</CollapsiblePanel>
		</section>
	)
}
