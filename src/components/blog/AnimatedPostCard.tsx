"use client"

import { motion } from "framer-motion"

interface Props {
	index: number
	children: React.ReactNode
}

export default function AnimatedPostCard({ index, children }: Props) {
	return (
		<motion.div
			initial={{ opacity: 0, y: -12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3, delay: index * 0.06, ease: "easeOut" }}
		>
			{children}
		</motion.div>
	)
}
