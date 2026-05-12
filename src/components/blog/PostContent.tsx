"use client"

import { motion } from "framer-motion"
import { postDatetimeToISO } from "@/lib/format"
import { fadeUp } from "@/lib/motion"

interface Props {
	title: string
	formattedDate: string
	datetime: string
	readingTime: string | null
	children: React.ReactNode
}

export default function PostContent({
	title,
	formattedDate,
	datetime,
	readingTime,
	children,
}: Props) {
	return (
		<article className="mx-auto w-full max-w-3xl px-4 py-12">
			<motion.header className="mb-10" {...fadeUp(0)}>
				<h1 className="mb-3 text-4xl font-bold">{title}</h1>
				<div className="text-secondary flex gap-4 text-sm">
					<time dateTime={postDatetimeToISO(datetime) ?? undefined}>
						{formattedDate}
					</time>
					{readingTime && <span>{readingTime}</span>}
				</div>
			</motion.header>

			<motion.div {...fadeUp(0.1)}>{children}</motion.div>
		</article>
	)
}
