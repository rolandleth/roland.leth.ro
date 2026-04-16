"use client"

import { motion } from "framer-motion"
import { fadeUp } from "@/lib/motion"

type FadeInTag = "div" | "aside" | "section"

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
	const Component = motion[as]

	return (
		<Component className={className} {...fadeUp(delay)}>
			{children}
		</Component>
	)
}
