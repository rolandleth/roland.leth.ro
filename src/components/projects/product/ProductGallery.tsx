"use client"

import { createContext, useContext, useState } from "react"
import { firstIndexOfGroup } from "@/lib/client/gallery"
import ProjectImageLightbox from "../ProjectImageLightbox"
import ProjectSectionCarousel from "../ProjectSectionCarousel"
import type { GalleryImage } from "@/lib/client/gallery"
import type { ReactNode } from "react"

interface GalleryContextValue {
	images: GalleryImage[]
	isFirstImagePriority: boolean
	/** Each group's current slide, by group index; absent means the first. */
	slideByGroup: Readonly<Record<number, number>>
	selectSlide: (groupIndex: number, localIndex: number) => void
	openLightbox: (groupIndex: number) => void
}

const GalleryContext = createContext<GalleryContextValue | null>(null)

interface ProviderProps {
	/**
	 * Every gallery's images, flattened in page order (`productGalleryGroups`,
	 * then `flattenGroups`).
	 */
	images: GalleryImage[]
	/** Project name, for the lightbox's accessible label. */
	galleryLabel: string
	/**
	 * True when the first image on the page loads with `priority`: there's no
	 * hero image to take it.
	 */
	isFirstImagePriority: boolean
	children: ReactNode
}

/**
 * The state behind the product page's screenshots: one carousel per gallery (a
 * section's, or a step's), each on its own slide, and a single lightbox that
 * walks every image on the page. Opening the lightbox from a gallery starts on
 * that gallery's current slide; paging through it moves the owning gallery
 * along, so closing it leaves the page showing the last image viewed.
 *
 * The sections themselves are server-rendered and passed through as
 * `children`; only the carousels (`ProductGroupGallery`) read this context.
 */
export function ProductGalleryProvider({
	images,
	galleryLabel,
	isFirstImagePriority,
	children,
}: ProviderProps) {
	const [slideByGroup, setSlideByGroup] = useState<
		Readonly<Record<number, number>>
	>({})
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

	function selectSlide(groupIndex: number, localIndex: number) {
		setSlideByGroup((previous) => ({
			...previous,
			[groupIndex]: localIndex,
		}))
	}

	function openLightbox(groupIndex: number) {
		const first = firstIndexOfGroup(images, groupIndex)

		if (first === -1) {
			return
		}

		setLightboxIndex(first + (slideByGroup[groupIndex] ?? 0))
	}

	// Pages with wrap-around across every gallery, like the tabbed layout's
	// lightbox, and keeps the image's own carousel in step.
	function stepLightbox(direction: 1 | -1) {
		if (lightboxIndex == null || images.length === 0) {
			return
		}

		const next =
			(((lightboxIndex + direction) % images.length) + images.length) %
			images.length
		const image = images[next]

		setLightboxIndex(next)
		selectSlide(image.groupIndex, image.localIndex)
	}

	return (
		<GalleryContext.Provider
			value={{
				images,
				isFirstImagePriority,
				slideByGroup,
				selectSlide,
				openLightbox,
			}}
		>
			{children}

			{images.length > 0 && (
				<ProjectImageLightbox
					isOpen={lightboxIndex != null}
					images={images}
					index={lightboxIndex ?? 0}
					galleryLabel={galleryLabel}
					canNavigate={images.length > 1}
					onClose={() => setLightboxIndex(null)}
					onPrev={() => stepLightbox(-1)}
					onNext={() => stepLightbox(1)}
				/>
			)}
		</GalleryContext.Provider>
	)
}

interface GroupGalleryProps {
	groupIndex: number
	/** The carousel's accessible name, before "screenshots". */
	label: string
	/** The `sizes` for the carousel's images, for where this gallery sits. */
	sizes: string
}

/**
 * One gallery's carousel, or nothing when the group has no images. Must sit
 * inside `ProductGalleryProvider`.
 */
export function ProductGroupGallery({
	groupIndex,
	label,
	sizes,
}: GroupGalleryProps) {
	const gallery = useContext(GalleryContext)

	if (gallery == null) {
		throw new Error(
			"ProductGroupGallery rendered outside ProductGalleryProvider"
		)
	}

	const groupImages = gallery.images.filter(
		(image) => image.groupIndex === groupIndex
	)

	if (groupImages.length === 0) {
		return null
	}

	// The page's first image is this group's first one only when no group
	// comes before it.
	const isPriorityGroup =
		gallery.isFirstImagePriority &&
		firstIndexOfGroup(gallery.images, groupIndex) === 0

	return (
		<ProjectSectionCarousel
			images={groupImages}
			index={gallery.slideByGroup[groupIndex] ?? 0}
			canNavigate={groupImages.length > 1}
			galleryLabel={label}
			onSelectImage={(localIndex) =>
				gallery.selectSlide(groupIndex, localIndex)
			}
			onEnlarge={() => gallery.openLightbox(groupIndex)}
			sizes={sizes}
			priorityIndex={isPriorityGroup ? 0 : undefined}
			isLazy
			stageClassName="product-shot aspect-[1270/760] w-full rounded-xl"
		/>
	)
}
