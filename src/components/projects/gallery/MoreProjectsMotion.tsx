"use client"

import { motion, useTransform } from "framer-motion"
import { createContext, useContext } from "react"
import type { MotionValue } from "framer-motion"
import type { ReactNode } from "react"

/**
 * How far a project's place in the full list sits from its icon in the preview
 * row, in pixels. Motion values, so a new measurement moves the slide without
 * a re-render.
 */
export interface PreviewOffset {
	x: MotionValue<number>
	y: MotionValue<number>
}

interface MoreProjectsMotionValue {
	/** 0 with the preview showing, 1 with the full list open; animated between. */
	progress: MotionValue<number>
	/** The offset for a project in the preview, by its id. */
	offsetOf: (projectId: string) => PreviewOffset
}

export const MoreProjectsMotionContext =
	createContext<MoreProjectsMotionValue | null>(null)

function useMoreProjectsMotion(): MoreProjectsMotionValue {
	const context = useContext(MoreProjectsMotionContext)

	if (context == null) {
		throw new Error(
			"More projects motion rendered outside MoreProjectsDisclosure"
		)
	}

	return context
}

interface SlideProps {
	projectId: string
	children: ReactNode
}

/**
 * A project of the full list that the preview row also shows. Closed, it sits
 * on top of its preview icon; opening slides it to its place in the list, and
 * closing slides it back. It stays above the icons fading in around it, which
 * it passes over on the way.
 */
export function SlideFromPreview({ projectId, children }: SlideProps) {
	const { progress, offsetOf } = useMoreProjectsMotion()
	const offset = offsetOf(projectId)
	const x = useTransform(
		[progress, offset.x],
		([openness, distance]: number[]) => (1 - openness) * distance
	)
	const y = useTransform(
		[progress, offset.y],
		([openness, distance]: number[]) => (1 - openness) * distance
	)

	return (
		<motion.div
			style={{ x, y }}
			className="relative z-10 flex flex-col items-center"
		>
			{children}
		</motion.div>
	)
}

interface FadeProps {
	/** The element to render; a heading fades as itself. */
	as?: "div" | "h3"
	className?: string
	children: ReactNode
}

/**
 * Whatever the preview row doesn't show: the group headings, the platform tags
 * and the projects past the preview. It fades in as the list opens and out as
 * it closes.
 */
export function FadeInWithList({ as = "div", className, children }: FadeProps) {
	const { progress } = useMoreProjectsMotion()
	const Element = as === "h3" ? motion.h3 : motion.div

	return (
		<Element style={{ opacity: progress }} className={className}>
			{children}
		</Element>
	)
}
