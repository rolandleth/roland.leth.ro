"use client"

import { motion } from "framer-motion"

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
		<motion.div
			initial={{ opacity: 0, y: -12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				duration: 0.3,
				delay: index * delayMultiplier,
				ease: "easeOut",
			}}
		>
			{children}
		</motion.div>
	)
}
