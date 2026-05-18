"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import Typewriter from "@/components/Typewriter"
import { fadeUp } from "@/lib/client/motion"
import { navLinks } from "@/lib/client/navigation"

const phrases = [
	"iOS developer",
	"Full-stack engineer",
	"Product & UX focused",
	"Business-driven",
	"Engineering leader",
]

export default function HomeHero() {
	return (
		<div className="relative flex flex-col items-center text-center">
			<motion.h1
				className="text-primary text-5xl font-bold tracking-tight sm:text-6xl"
				{...fadeUp(0, 16)}
			>
				Roland Leth
			</motion.h1>

			<motion.div
				className="text-secondary mt-4 h-8 text-xl sm:text-2xl"
				{...fadeUp(0.1, 16)}
			>
				<Typewriter phrases={phrases} />
			</motion.div>

			<motion.p
				className="text-secondary mt-6 max-w-md text-base leading-relaxed"
				{...fadeUp(0.2, 16)}
			>
				Building things that matter since 2011
			</motion.p>

			<motion.nav
				aria-label="Site sections"
				className="mt-12 flex gap-10"
				{...fadeUp(0.3, 16)}
			>
				{navLinks.map(({ href, label }) => (
					<Link
						key={href}
						href={href}
						className="text-primary group text-lg font-medium transition-colors duration-300 hover:text-(--color-accent)"
					>
						{label}
						<span
							aria-hidden
							className="ml-1.5 inline-block text-(--color-accent) transition-transform duration-300 group-hover:translate-x-1"
						>
							&rarr;
						</span>
					</Link>
				))}
			</motion.nav>
		</div>
	)
}
