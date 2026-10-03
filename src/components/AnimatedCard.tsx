"use client"

import { motion } from "framer-motion"
import { fadeUp } from "@/lib/client/motion"

interface Props {
	index: number
	delayMultiplier?: number
	/** For the wrapper, which is the grid item when the card sits in a grid. */
	className?: string
	children: React.ReactNode
}

export default function AnimatedCard({
	index,
	delayMultiplier = 0.06,
	className,
	children,
}: Props) {
	return (
		<motion.div className={className} {...fadeUp(index * delayMultiplier)}>
			{children}
		</motion.div>
	)
}
