"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ChevronLeft, ChevronRight } from "lucide-react"
import Image from "next/image"
import { useState } from "react"

interface CarouselImage {
	id: number
	url: string
	caption: string | null
}

interface Props {
	images: CarouselImage[]
	altPrefix: string
}

// Hoisted so every carousel render doesn't build a new object; framer-motion
// compares `variants` references and reinitializes the animation state when
// the object identity changes.
const variants = {
	enter: (d: number) => ({ x: d > 0 ? "60%" : "-60%", opacity: 0 }),
	center: { x: 0, opacity: 1 },
	exit: (d: number) => ({ x: d > 0 ? "-60%" : "60%", opacity: 0 }),
}

export default function ProjectSectionCarousel({ images, altPrefix }: Props) {
	const [[currentIndex, direction], setPage] = useState([0, 0])

	const isMultiple = images.length > 1
	const current = images[currentIndex]

	function paginate(newDirection: number) {
		setPage(([index]) => {
			const nextIndex = (index + newDirection + images.length) % images.length

			return [nextIndex, newDirection]
		})
	}

	return (
		<div>
			{/* Image area — fixed height so layout never shifts between slides */}
			<div className="group relative h-120 overflow-hidden rounded-xl">
				<AnimatePresence initial={false} custom={direction}>
					<motion.div
						key={currentIndex}
						custom={direction}
						variants={variants}
						initial="enter"
						animate="center"
						exit="exit"
						transition={{ duration: 0.3, ease: "easeInOut" }}
						className="absolute inset-0"
					>
						<Image
							src={current.url}
							alt={current.caption ?? `${altPrefix} screenshot`}
							fill
							loading="eager"
							sizes="(max-width: 768px) calc(100vw - 2rem), 736px"
							className="object-contain"
						/>
					</motion.div>
				</AnimatePresence>

				{/* Prev / Next arrows */}
				{isMultiple && (
					<>
						{/* `focus-visible:opacity-100` reveals the arrows for keyboard
							focus too; without it, Tab landed on a transparent button. */}
						<button
							type="button"
							onClick={() => paginate(-1)}
							aria-label="Previous image"
							className="absolute top-1/2 left-2 -translate-y-1/2 cursor-pointer rounded-full bg-black/40 p-1.5 text-white opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100 focus-visible:opacity-100"
						>
							<ChevronLeft size={18} />
						</button>

						<button
							type="button"
							onClick={() => paginate(1)}
							aria-label="Next image"
							className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-full bg-black/40 p-1.5 text-white opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100 focus-visible:opacity-100"
						>
							<ChevronRight size={18} />
						</button>
					</>
				)}
			</div>

			{/* Caption */}
			{current.caption && (
				<p className="text-secondary mt-2 text-center text-xs">
					{current.caption}
				</p>
			)}

			{/* Dot indicators */}
			{isMultiple && (
				<div className="mt-3 flex justify-center gap-1.5">
					{images.map((_, i) => (
						// `before:` pseudo extends the click region to ~24px without
						// inflating the visual dot — keeps the indicator subtle while
						// meeting WCAG AAA 24px hit-target guidance.
						<button
							key={i}
							type="button"
							onClick={() => setPage([i, i > currentIndex ? 1 : -1])}
							aria-label={`Go to image ${i + 1}`}
							aria-current={i === currentIndex ? true : undefined}
							className={`relative h-1.5 rounded-full transition-all duration-300 before:absolute before:inset-0 before:-m-2.5 before:content-[''] ${
								i === currentIndex
									? "w-4 bg-(--color-accent)"
									: "w-1.5 bg-(--color-border) hover:bg-(--color-secondary)"
							}`}
						/>
					))}
				</div>
			)}
		</div>
	)
}
