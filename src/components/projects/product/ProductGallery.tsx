"use client"

import { createContext, useContext, useState } from "react"
import { firstIndexOfSection } from "@/lib/client/gallery"
import ProjectImageLightbox from "../ProjectImageLightbox"
import ProjectSectionCarousel from "../ProjectSectionCarousel"
import type { GalleryImage } from "@/lib/client/gallery"
import type { ReactNode } from "react"

interface GalleryContextValue {
	images: GalleryImage[]
	priorityImageId: number | null
	/** Each section's current slide, by section index; absent means the first. */
	slideBySection: Readonly<Record<number, number>>
	selectSlide: (sectionIndex: number, localIndex: number) => void
	openLightbox: (sectionIndex: number) => void
}

const GalleryContext = createContext<GalleryContextValue | null>(null)

interface ProviderProps {
	/** Every section's images, flattened in page order (`flattenSections`). */
	images: GalleryImage[]
	/** Project name, for the lightbox's accessible label. */
	galleryLabel: string
	/**
	 * The one image on the page that loads with `priority`, when it's a
	 * screenshot; null when the hero image has it instead.
	 */
	priorityImageId: number | null
	children: ReactNode
}

/**
 * The state behind the product page's screenshots: one carousel per section,
 * each on its own slide, and a single lightbox that walks every image on the
 * page. Opening the lightbox from a section starts on that section's current
 * slide; paging through it moves the owning section's carousel along, so
 * closing it leaves the page showing the last image viewed.
 *
 * The sections themselves are server-rendered and passed through as
 * `children`; only the carousels (`ProductSectionGallery`) read this context.
 */
export function ProductGalleryProvider({
	images,
	galleryLabel,
	priorityImageId,
	children,
}: ProviderProps) {
	const [slideBySection, setSlideBySection] = useState<
		Readonly<Record<number, number>>
	>({})
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

	function selectSlide(sectionIndex: number, localIndex: number) {
		setSlideBySection((previous) => ({
			...previous,
			[sectionIndex]: localIndex,
		}))
	}

	function openLightbox(sectionIndex: number) {
		const first = firstIndexOfSection(images, sectionIndex)

		if (first === -1) {
			return
		}

		setLightboxIndex(first + (slideBySection[sectionIndex] ?? 0))
	}

	// Pages with wrap-around across every section, like the tabbed layout's
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
		selectSlide(image.sectionIndex, image.localIndex)
	}

	return (
		<GalleryContext.Provider
			value={{
				images,
				priorityImageId,
				slideBySection,
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

interface SectionGalleryProps {
	sectionIndex: number
	/** The carousel's accessible name, before "screenshots". */
	label: string
}

// The content column is 840px at most; below 640px the page has 16px gutters.
const SECTION_IMAGE_SIZES = "(max-width: 640px) calc(100vw - 2rem), 840px"

/**
 * One section's carousel, or nothing when the section has no images. Must sit
 * inside `ProductGalleryProvider`.
 */
export function ProductSectionGallery({
	sectionIndex,
	label,
}: SectionGalleryProps) {
	const gallery = useContext(GalleryContext)

	if (gallery == null) {
		throw new Error(
			"ProductSectionGallery rendered outside ProductGalleryProvider"
		)
	}

	const sectionImages = gallery.images.filter(
		(image) => image.sectionIndex === sectionIndex
	)

	if (sectionImages.length === 0) {
		return null
	}

	const priorityIndex = sectionImages.findIndex(
		(image) => image.id === gallery.priorityImageId
	)

	return (
		<ProjectSectionCarousel
			images={sectionImages}
			index={gallery.slideBySection[sectionIndex] ?? 0}
			canNavigate={sectionImages.length > 1}
			galleryLabel={label}
			onSelectImage={(localIndex) =>
				gallery.selectSlide(sectionIndex, localIndex)
			}
			onEnlarge={() => gallery.openLightbox(sectionIndex)}
			sizes={SECTION_IMAGE_SIZES}
			priorityIndex={priorityIndex === -1 ? undefined : priorityIndex}
			isLazy
			stageClassName="product-shot aspect-[1270/760] w-full rounded-xl"
		/>
	)
}
