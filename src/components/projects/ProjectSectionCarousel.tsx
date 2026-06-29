"use client"

import { motion, type PanInfo } from "framer-motion"
import Image from "next/image"
import { useState } from "react"
import { resolveSwipe } from "@/lib/client/swipe"

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
	 * Whether the gallery has anywhere to swipe. Mirrors the lightbox: `true`
	 * even for a single-image section when the arrows can cross into another
	 * section that holds images.
	 */
	canNavigate: boolean
	altPrefix: string
	onSelectImage: (index: number) => void
	/** Walk one image back, crossing into the previous section if needed. */
	onPrev: () => void
	/** Walk one image forward, crossing into the next section if needed. */
	onNext: () => void
	onEnlarge: () => void
}

export default function ProjectSectionCarousel({
	images,
	index,
	canNavigate,
	altPrefix,
	onSelectImage,
	onPrev,
	onNext,
	onEnlarge,
}: Props) {
	// Natural aspect ratio (w/h) of the displayed image, measured on load so the
	// stage hugs the image instead of letterboxing it inside a fixed-height box.
	// Null until the first image reports its size — the stage falls back to the
	// fixed height so it never collapses to zero before measurement.
	const [aspectRatio, setAspectRatio] = useState<number | null>(null)
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

	// Translate a horizontal drag into a page step; anything short of the
	// thresholds snaps back via the drag constraints.
	function handleDragEnd(_event: unknown, info: PanInfo) {
		if (!canNavigate) {
			return
		}

		const swipe = resolveSwipe(info)

		if (swipe === "next") {
			onNext()
		} else if (swipe === "prev") {
			onPrev()
		}
	}

	return (
		<div
			role="group"
			aria-roledescription="carousel"
			aria-label={`${altPrefix} screenshots`}
		>
			{/* Image area — the stage hugs the image's measured aspect ratio so a
			    landscape screenshot no longer letterboxes inside a tall fixed box.
			    Capped (70vh on mobile, 480px on wider screens) so a portrait shot
			    can't run the page off-screen; `overflow-hidden` clips the image as
			    it rubber-bands during a swipe. Before the first image reports its
			    size, fall back to the fixed height so the box never collapses to
			    zero. */}
			<div
				className={`relative max-h-[70vh] w-full overflow-hidden rounded-xl sm:max-h-120 ${aspectRatio === null ? "h-120" : ""}`}
				style={aspectRatio === null ? undefined : { aspectRatio }}
				aria-live="polite"
				aria-atomic="true"
			>
				{/* Drag layer — fills the stage and carries the swipe gesture.
				    Rubber-bands back to centre when the swipe falls short of the
				    threshold; a tap below the drag threshold still reaches the
				    enlarge button underneath. The image swaps instantly on
				    navigation, with no slide transition. */}
				<motion.div
					className="absolute inset-0"
					drag={canNavigate ? "x" : false}
					dragConstraints={{ left: 0, right: 0 }}
					dragElastic={0.2}
					onDragEnd={handleDragEnd}
				>
					{/* `fill` + `object-contain` sizes the image from the stage
					    box, not from its (mis-computed under `width/height={0}`)
					    intrinsic size, so it renders at full size on every DPR.
					    `onLoad` reads the natural dimensions to size the stage to
					    this image's ratio. `draggable={false}` stops the browser's
					    native image drag from hijacking the swipe. Click to
					    enlarge: the carousel caps at 736px, so the lightbox
					    reveals finer detail. */}
					<button
						type="button"
						onClick={onEnlarge}
						aria-label={`Enlarge ${imageAlt}`}
						className="absolute inset-0 cursor-zoom-in"
					>
						<Image
							src={current.url}
							alt={imageAlt}
							fill
							loading="eager"
							draggable={false}
							onLoad={(event) => {
								const { naturalWidth, naturalHeight } = event.currentTarget

								if (naturalWidth > 0 && naturalHeight > 0) {
									setAspectRatio(naturalWidth / naturalHeight)

									return
								}

								// Invalid dimensions leave the stage on its `h-120` fallback
								// forever — surface in dev so a broken asset is debuggable
								// rather than silently mis-sized.
								if (process.env.NODE_ENV !== "production") {
									// eslint-disable-next-line no-console
									console.warn(
										`[ProjectSectionCarousel] image ${current.url} reported invalid dimensions (${naturalWidth}×${naturalHeight}); stage stays on its fallback height`
									)
								}
							}}
							sizes="(max-width: 768px) calc(100vw - 2rem), 736px"
							className="pointer-events-none object-contain select-none"
						/>
					</button>
				</motion.div>
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
