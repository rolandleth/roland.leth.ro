"use client"

import { animate, useMotionValue, useReducedMotion } from "framer-motion"
import { useEffect, useRef } from "react"
import { useElementSize } from "@/components/ui/useElementSize"
import { resolveSwipe } from "@/lib/client/swipe"
import { clamp } from "@/lib/client/zoom"
import GalleryTrack from "./GalleryTrack"
import type { GalleryImage } from "@/lib/client/gallery"
import type { PanInfo } from "framer-motion"

interface Props {
	/** The whole flat gallery (across sections) — the track slides continuously. */
	images: GalleryImage[]
	/** Flat index of the centred slide, owned by the parent. */
	index: number
	/** Whether there's more than one slide to move between. */
	canNavigate: boolean
	/** Project name, for the carousel's group label. */
	galleryLabel: string
	/** Jump to an arbitrary flat index (dot taps and multi-slide drags). */
	onSelectImage: (flatIndex: number) => void
	/** Enlarge the current image into the lightbox. */
	onEnlarge: () => void
}

// Spring for snapping the strip to a slide — quick and lightly damped so it
// settles inside Apple's 0.2–0.3s window.
const SNAP_SPRING = { type: "spring", stiffness: 320, damping: 34 } as const
// A pointer that travels more than this (px) before release counts as a swipe,
// so the click the browser fires on release is swallowed instead of also
// opening the lightbox.
const SWIPE_CLICK_TRAVEL = 8

export default function ProjectSectionCarousel({
	images,
	index,
	canNavigate,
	galleryLabel,
	onSelectImage,
	onEnlarge,
}: Props) {
	const stageRef = useRef<HTMLDivElement | null>(null)
	const { width } = useElementSize(stageRef)
	const x = useMotionValue(0)
	// Not covered by `<MotionPreferences>`: the standalone `animate()` takes
	// `reduceMotion` from its own options, never from MotionConfig context.
	const prefersReducedMotion = useReducedMotion()
	// Set true by a real swipe so the trailing click doesn't also fire the
	// enlarge; reset at the start of each new interaction (stage pointer-down).
	const suppressEnlargeRef = useRef(false)
	// Pointer's x at the gesture's start, to measure travel on release. Framer
	// fires `onDragEnd` a frame late (`frame.postRender`), after the browser's
	// click — too late to gate the enlarge — so we detect the swipe from the raw
	// pointer instead.
	const pointerDownXRef = useRef(0)

	// Keep the strip aligned to the centred slide. Snap instantly before the
	// stage has measured (width 0) or when reduced motion is requested; otherwise
	// spring to it. Re-runs whenever the parent moves the index or the stage
	// resizes.
	useEffect(() => {
		const target = -index * width

		if (width === 0 || prefersReducedMotion) {
			x.set(target)
			return
		}

		const controls = animate(x, target, SNAP_SPRING)

		return () => controls.stop()
	}, [index, width, prefersReducedMotion, x])

	// Translate a released drag into a slide. Snap to whichever slide the strip is
	// closest to; a fast flick that didn't quite cross the midpoint still advances
	// one slide in its direction.
	function handleDragEnd(_event: unknown, info: PanInfo) {
		if (!canNavigate || width === 0) {
			animate(x, -index * width, SNAP_SPRING)
			return
		}

		const settled = Math.round(-x.get() / width)
		const flick = resolveSwipe(info)
		let target = settled

		if (flick === "next") {
			target = Math.max(settled, index + 1)
		} else if (flick === "prev") {
			target = Math.min(settled, index - 1)
		}

		target = clamp(target, 0, images.length - 1)

		if (target === index) {
			// Fell short — rubber-band back to the current slide.
			animate(x, -index * width, SNAP_SPRING)
			return
		}

		// The parent moves the index; the effect above springs the strip to it.
		onSelectImage(target)
	}

	// Enlarge unless the "click" is really the tail of a swipe (see
	// `suppressEnlargeRef`).
	function handleEnlarge() {
		if (suppressEnlargeRef.current) {
			return
		}

		onEnlarge()
	}

	// Defensive: callers gate on the active section having images, but enforcing
	// the contract locally means a future caller that forgets the gate fails
	// loudly in dev rather than rendering a broken, index-less strip.
	if (images.length === 0) {
		if (process.env.NODE_ENV !== "production") {
			// eslint-disable-next-line no-console
			console.warn(
				`[ProjectSectionCarousel] rendered with an empty gallery for "${galleryLabel}" — caller should gate on a non-empty gallery`
			)
		}

		return null
	}

	const current = images[index]
	// Dots stay scoped to the *current* section even though the strip spans the
	// whole gallery, so a project with many sections doesn't sprout a runaway row
	// of dots. The section's first slide sits `localIndex` back from here.
	const sectionStart = index - current.localIndex
	const sectionImages = images.filter(
		(image) => image.sectionIndex === current.sectionIndex
	)
	const isMultiple = sectionImages.length > 1

	return (
		<div
			role="group"
			aria-roledescription="carousel"
			aria-label={`${galleryLabel} screenshots`}
		>
			{/* Live status: every slide persists in the strip's DOM, so an
			    aria-live region wrapping the images wouldn't announce the change on
			    navigation. This visually-hidden line carries real text that swaps
			    with the slide, which a screen reader does announce. */}
			<p className="sr-only" aria-live="polite" aria-atomic="true">
				{`Image ${current.localIndex + 1} of ${sectionImages.length}${
					current.caption ? `: ${current.caption}` : ""
				}`}
			</p>

			{/* The stage tracks the 1270×760 shape every staged marketing shot ships
			    in, so slides hug their content instead of letterboxing; the height
			    caps keep a stable, sane stage if a differently-shaped image ever
			    lands (it aspect-fits via `object-contain`). `overflow-hidden` clips
			    the off-screen slides. */}
			<div
				ref={stageRef}
				className="relative aspect-[1270/760] max-h-[60vh] w-full overflow-hidden rounded-xl sm:max-h-120"
				// Start each interaction with a clean suppress flag and record where the
				// pointer went down. Capture phase, so it runs before the drag layer.
				onPointerDownCapture={(event) => {
					if (!event.isPrimary) {
						return
					}

					suppressEnlargeRef.current = false
					pointerDownXRef.current = event.clientX
				}}
				// pointerup dispatches before the browser's click, so flagging a swipe
				// here reliably gates the enlarge that the click would otherwise fire —
				// unlike framer's `onDragEnd`, which lands a frame too late.
				onPointerUpCapture={(event) => {
					if (!event.isPrimary) {
						return
					}

					if (
						Math.abs(event.clientX - pointerDownXRef.current) >
						SWIPE_CLICK_TRAVEL
					) {
						suppressEnlargeRef.current = true
					}
				}}
			>
				<GalleryTrack
					images={images}
					index={index}
					x={x}
					sizes="(max-width: 768px) calc(100vw - 2rem), 736px"
					onActivateSlide={handleEnlarge}
					drag={canNavigate ? "x" : false}
					dragConstraints={{ left: -(images.length - 1) * width, right: 0 }}
					onDragEnd={handleDragEnd}
				/>
			</div>

			{/* Caption — the current slide's, below the stage. */}
			{current.caption && (
				<p className="text-secondary mt-2 text-center text-xs">
					{current.caption}
				</p>
			)}

			{/* Dot indicators — scoped to the current section's images. */}
			{isMultiple && (
				<div className="mt-1 flex justify-center">
					{sectionImages.map((_, i) => (
						// Padded button gives a ~26px square hit region (WCAG AAA 24px)
						// while the inner span keeps the visible indicator subtle.
						<button
							key={i}
							type="button"
							onClick={() => onSelectImage(sectionStart + i)}
							aria-label={`Go to image ${i + 1}`}
							aria-current={i === current.localIndex ? true : undefined}
							className="group cursor-pointer p-2.5"
						>
							<span
								className={`block h-1.5 rounded-full transition-all duration-300 ${
									i === current.localIndex
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
