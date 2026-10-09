"use client"

import {
	animate,
	motion,
	motionValue,
	useMotionValue,
	useReducedMotion,
	useTransform,
} from "framer-motion"
import { useCallback, useMemo, useRef, useState } from "react"
import { MoreProjectsMotionContext } from "./MoreProjectsMotion"
import type { PreviewOffset } from "./MoreProjectsMotion"
import type { ReactNode } from "react"

// The gallery's one section heading; the tiles and the cards have none.
const HEADING_CLASS =
	"text-primary font-serif text-[30px] leading-[1.15] font-normal tracking-[-0.015em]"

// Longer than `CollapsiblePanel`'s 0.25s: the icons travel further than a panel
// fades.
const TRANSITION = { duration: 0.3, ease: "easeOut" } as const

// The layer out of flow lies over the one in flow, from the box's top, so the
// box takes the in-flow layer's height when nothing moves.
const OVERLAY_CLASS = "absolute inset-x-0 top-0"

/**
 * - `closed`: the preview row shows; the full list is hidden behind it.
 * - `opening`, `open`: the full list shows, its preview icons sliding out of
 *   the row, then in place.
 * - `closing`: the full list still shows while its icons slide back; the
 *   preview row takes over once they land on it.
 */
type Phase = "closed" | "opening" | "open" | "closing"

interface Props {
	id: string
	count: number
	/** The first icons, shown while closed, each linking to its project. */
	preview: ReactNode
	/** The full list, grouped by platform. */
	children: ReactNode
	className?: string
}

/**
 * The open-and-close part of "More projects": the heading is the button, with
 * "Show all N" or "Hide" at its end.
 *
 * The preview row and the full list are both always rendered, one over the
 * other, so every link is in the server HTML. Opening measures each preview
 * icon against its place in the list; the list's copy starts on the icon and
 * slides to its place, while everything else in the list fades in and the box
 * grows. Closing plays it backwards. One `progress` value drives the slides,
 * the fades and the height, so they can't drift apart, and a tap mid-way
 * reverses from wherever they are. Readers who ask for less motion get the
 * switch at once.
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
	const [phase, setPhase] = useState<Phase>("closed")
	const prefersReducedMotion = useReducedMotion()
	const previewRef = useRef<HTMLDivElement>(null)
	const listRef = useRef<HTMLDivElement>(null)
	const offsets = useRef(new Map<string, PreviewOffset>())
	// Counts the toggles, so a superseded animation's end can't settle the phase.
	const toggleCount = useRef(0)
	const progress = useMotionValue(0)
	const previewHeight = useMotionValue(0)
	const listHeight = useMotionValue(0)
	const height = useTransform(
		[progress, previewHeight, listHeight],
		([openness, closedHeight, openHeight]: number[]) =>
			closedHeight + (openHeight - closedHeight) * openness
	)
	const titleId = `${id}-title`
	const listId = `${id}-list`
	const isOpen = phase === "opening" || phase === "open"
	const isPreviewShown = phase === "closed"
	const isMoving = phase === "opening" || phase === "closing"

	const offsetOf = useCallback((projectId: string) => {
		const existing = offsets.current.get(projectId)

		if (existing != null) {
			return existing
		}

		const offset = { x: motionValue(0), y: motionValue(0) }
		offsets.current.set(projectId, offset)

		return offset
	}, [])

	const motionContext = useMemo(
		() => ({ progress, offsetOf }),
		[progress, offsetOf]
	)

	/**
	 * Reads both layers' heights and each preview icon's offset from its place
	 * in the list. Measures the `li`s, which never move: the slides inside them
	 * do. Runs on every toggle, so a resize since the last one doesn't matter.
	 */
	function measure() {
		const previewLayer = previewRef.current
		const listLayer = listRef.current

		if (previewLayer == null || listLayer == null) {
			return
		}

		previewHeight.set(previewLayer.getBoundingClientRect().height)
		listHeight.set(listLayer.getBoundingClientRect().height)

		const previewItems =
			previewLayer.querySelectorAll<HTMLElement>("[data-project-id]")

		for (const previewItem of previewItems) {
			const projectId = previewItem.dataset.projectId
			const listItem = listLayer.querySelector<HTMLElement>(
				`[data-project-id="${projectId}"]`
			)

			// Never true: the preview and the list come from the same projects.
			if (projectId == null || listItem == null) {
				continue
			}

			const from = previewItem.getBoundingClientRect()
			const to = listItem.getBoundingClientRect()
			const offset = offsetOf(projectId)
			offset.x.set(from.left - to.left)
			offset.y.set(from.top - to.top)
		}
	}

	function toggle() {
		const willOpen = !isOpen
		toggleCount.current += 1
		const toggleNumber = toggleCount.current

		measure()
		setPhase(willOpen ? "opening" : "closing")
		// Starting an animation on `progress` stops the one already running, so
		// a tap mid-way reverses from where it is.
		animate(progress, willOpen ? 1 : 0, {
			...(prefersReducedMotion === true ? { duration: 0 } : TRANSITION),
			onComplete: () => {
				if (toggleNumber !== toggleCount.current) {
					return
				}

				setPhase(willOpen ? "open" : "closed")
			},
		})
	}

	return (
		<section id={id} aria-labelledby={titleId} className={className}>
			<h2 id={titleId} className={`m-0 ${HEADING_CLASS}`}>
				<button
					type="button"
					aria-expanded={isOpen}
					aria-controls={listId}
					onClick={toggle}
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

			<MoreProjectsMotionContext.Provider value={motionContext}>
				{/* `isolate` keeps the slides' z-index inside the box. */}
				<motion.div
					style={{ height: isMoving ? height : "auto" }}
					className="relative isolate overflow-hidden"
				>
					<div
						ref={previewRef}
						aria-hidden={!isPreviewShown}
						inert={!isPreviewShown}
						className={`pt-6 ${isPreviewShown ? "" : "invisible"} ${isOpen ? OVERLAY_CLASS : ""}`}
					>
						{preview}
					</div>

					<div
						ref={listRef}
						id={listId}
						role="region"
						aria-labelledby={titleId}
						aria-hidden={!isOpen}
						inert={!isOpen}
						className={`pt-6 ${isPreviewShown ? "invisible" : ""} ${isOpen ? "" : OVERLAY_CLASS}`}
					>
						{children}
					</div>
				</motion.div>
			</MoreProjectsMotionContext.Provider>
		</section>
	)
}
