"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import { galleryImageAlt, type GalleryImage } from "@/lib/client/gallery"
import type { MotionStyle, MotionValue, PanInfo } from "framer-motion"

interface Props {
	/** The whole flat gallery — every slide is laid out in one horizontal row. */
	images: GalleryImage[]
	/** Flat index of the centred slide. */
	index: number
	/**
	 * Track translate in px, owned by the caller's gesture layer. The row is one
	 * viewport-width per slide, so the caller animates this to `-index * width`.
	 */
	x: MotionValue<number>
	/** `sizes` hint forwarded to every slide's `next/image`. */
	sizes: string
	/**
	 * Transform applied to the centred slide only (scale + pan for the lightbox
	 * zoom). Neighbours never zoom, so only the active slide reads it.
	 */
	activeSlideStyle?: MotionStyle
	/**
	 * When set, the centred slide becomes a button that fires this (the carousel's
	 * "tap to enlarge"). Omitted in the lightbox, where taps drive zoom instead.
	 */
	onActivateSlide?: () => void
	/** Framer drag wiring — the carousel binds its swipe here; the lightbox omits it. */
	drag?: false | "x"
	dragConstraints?: { left: number; right: number }
	onDragEnd?: (event: unknown, info: PanInfo) => void
}

/**
 * Eager-load the centred slide and its immediate neighbours (the ones a single
 * swipe reveals); lazy-load the rest so a long gallery doesn't fetch every
 * screenshot on mount.
 */
function slideLoading(offset: number): "eager" | "lazy" {
	return Math.abs(offset) <= 1 ? "eager" : "lazy"
}

/**
 * The horizontal slide strip shared by the on-page carousel and the lightbox: a
 * flex row holding every image at one-viewport width, translated by `x`. It owns
 * layout and lazy-loading only — each surface wraps it with its own gesture layer
 * (framer drag for the carousel, hand-rolled pointer events for the lightbox).
 */
export default function GalleryTrack({
	images,
	index,
	x,
	sizes,
	activeSlideStyle,
	onActivateSlide,
	drag = false,
	dragConstraints,
	onDragEnd,
}: Props) {
	return (
		<motion.div
			className="flex h-full"
			style={{ x }}
			drag={drag}
			dragConstraints={dragConstraints}
			dragElastic={0.15}
			dragMomentum={false}
			onDragEnd={onDragEnd}
		>
			{images.map((image, i) => {
				const isActive = i === index
				const alt = galleryImageAlt(image)
				const picture = (
					<Image
						src={image.url}
						alt={alt}
						fill
						sizes={sizes}
						draggable={false}
						loading={slideLoading(i - index)}
						// `pointer-events-none` lets the drag/zoom surface above receive
						// the gesture and stops the browser's native image drag.
						className="pointer-events-none object-contain select-none"
					/>
				)

				return (
					<div
						key={image.id}
						className="relative h-full shrink-0 basis-full"
						// Only the centred slide is exposed to assistive tech; the rest sit
						// off-screen in the strip and would otherwise be announced too.
						aria-hidden={isActive ? undefined : true}
					>
						{isActive && onActivateSlide ? (
							<button
								type="button"
								onClick={onActivateSlide}
								aria-label={`Enlarge ${alt}`}
								className="absolute inset-0 cursor-zoom-in"
							>
								{picture}
							</button>
						) : (
							<motion.div
								className="absolute inset-0"
								style={isActive ? activeSlideStyle : undefined}
							>
								{picture}
							</motion.div>
						)}
					</div>
				)
			})}
		</motion.div>
	)
}
