"use client"

import { motion } from "framer-motion"
import { fadeUp } from "@/lib/motion"

// Pulls the allowed tag set straight from Framer Motion's own typed surface,
// so any element `motion` supports works here without a hand-maintained union.
type FadeInTag = keyof typeof motion

interface Props {
	delay?: number
	as?: FadeInTag
	className?: string
	children: React.ReactNode
}

export default function FadeIn({
	delay = 0,
	as = "div",
	className,
	children,
}: Props) {
	const Component = motion[as] as React.ElementType

	return (
		<Component className={className} {...fadeUp(delay)}>
			{children}
		</Component>
	)
}
