"use client"

import { AnimatePresence, motion } from "framer-motion"
import Image from "next/image"

interface CarouselImage {
	id: number
	url: string
	caption: string | null
}

interface Props {
	images: CarouselImage[]
	/**
	 * Index of the visible image within `images`. Owned by the parent so the
	 * carousel, dots, and lightbox share a single gallery position and the
	 * arrows can walk across section boundaries.
	 */
	index: number
	/**
	 * Direction of the last index change (1 forward, -1 back, 0 none), supplied
	 * by the parent so the slide animation pushes the right way without the
	 * carousel having to track the previous index across renders.
	 */
	direction: number
	altPrefix: string
	onSelectImage: (index: number) => void
	onEnlarge: () => void
}

// Hoisted so every carousel render doesn't build a new object; framer-motion
// compares `variants` references and reinitializes the animation state when
// the object identity changes.
const variants = {
	enter: (d: number) => ({ x: d > 0 ? "60%" : "-60%", opacity: 0 }),
	center: { x: 0, opacity: 1 },
	exit: (d: number) => ({ x: d > 0 ? "-60%" : "60%", opacity: 0 }),
}

export default function ProjectSectionCarousel({
	images,
	index,
	direction,
	altPrefix,
	onSelectImage,
	onEnlarge,
}: Props) {
	// Defensive: callers gate on `section.images.length > 0`, but enforcing
	// the contract locally means `current.url` can never throw if a future
	// caller forgets the parent gate. A silent `return null` would otherwise
	// mask the missing parent gate — surface it loudly in dev so the
	// regression is debuggable, while keeping the render no-op in prod.
	if (images.length === 0) {
		if (process.env.NODE_ENV !== "production") {
			// eslint-disable-next-line no-console
			console.warn(
				`[ProjectSectionCarousel] rendered with empty images for "${altPrefix}" — caller should gate on \`images.length > 0\``
			)
		}

		return null
	}

	const isMultiple = images.length > 1
	const current = images[index]
	const imageAlt = current.caption ?? `${altPrefix} screenshot`

	return (
		<div
			role="group"
			aria-roledescription="carousel"
			aria-label={`${altPrefix} screenshots`}
		>
			{/* Image area — fixed height so layout never shifts between slides;
			    `overflow-hidden` clips the off-screen slides during transitions. */}
			<div
				className="relative h-120 overflow-hidden rounded-xl"
				aria-live="polite"
				aria-atomic="true"
			>
				<AnimatePresence initial={false} custom={direction}>
					<motion.div
						key={current.id}
						custom={direction}
						variants={variants}
						initial="enter"
						animate="center"
						exit="exit"
						transition={{ duration: 0.3, ease: "easeInOut" }}
						className="absolute inset-0"
					>
						{/* `fill` + `object-contain` sizes the image from the fixed stage
						    box, not from its (mis-computed under `width/height={0}`)
						    intrinsic size, so it renders at full size on every DPR. The
						    stage's `overflow-hidden rounded-xl` clips the corners: a
						    full-bleed screenshot gets rounded corners on the visible image;
						    a screenshot whose aspect differs from the stage letterboxes and
						    rounds the box instead — acceptable here, fully fixed by storing
						    real dimensions (planned). Click to enlarge: the carousel caps at
						    736px, so the lightbox reveals finer detail. */}
						<button
							type="button"
							onClick={onEnlarge}
							aria-label={`Enlarge ${imageAlt}`}
							className="relative h-full w-full cursor-zoom-in"
						>
							<Image
								src={current.url}
								alt={imageAlt}
								fill
								loading="eager"
								sizes="(max-width: 768px) calc(100vw - 2rem), 736px"
								className="object-contain"
							/>
						</button>
					</motion.div>
				</AnimatePresence>
			</div>

			{/* Caption */}
			{current.caption && (
				<p className="text-secondary mt-2 text-center text-xs">
					{current.caption}
				</p>
			)}

			{/* Dot indicators — scoped to this section's images. */}
			{isMultiple && (
				<div className="mt-1 flex justify-center">
					{images.map((_, i) => (
						// Padded button gives a ~26px square hit region (meets WCAG AAA
						// 24px guidance) while the inner span keeps the visible indicator
						// subtle. The prior `before:-m-2.5` pseudo overlapped adjacent
						// dots by ~14px so a click in the visible gap mis-routed.
						<button
							key={i}
							type="button"
							onClick={() => onSelectImage(i)}
							aria-label={`Go to image ${i + 1}`}
							aria-current={i === index ? true : undefined}
							className="group cursor-pointer p-2.5"
						>
							<span
								className={`block h-1.5 rounded-full transition-all duration-300 ${
									i === index
										? "w-4 bg-(--color-accent)"
										: "w-1.5 bg-(--color-border) group-hover:bg-(--color-secondary)"
								}`}
							/>
						</button>
					))}
				</div>
			)}
		</div>
	)
}
