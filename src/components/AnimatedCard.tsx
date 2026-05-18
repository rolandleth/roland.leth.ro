"use client"

import { motion } from "framer-motion"
import { fadeUp } from "@/lib/client/motion"

interface Props {
	index: number
	delayMultiplier?: number
	children: React.ReactNode
}

export default function AnimatedCard({
	index,
	delayMultiplier = 0.06,
	children,
}: Props) {
	return (
		<motion.div {...fadeUp(index * delayMultiplier)}>{children}</motion.div>
	)
}
