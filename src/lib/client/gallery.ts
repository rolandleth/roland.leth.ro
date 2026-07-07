/**
 * A single screenshot flattened out of its section into one continuous gallery,
 * carrying enough context to slide across section boundaries and to keep the
 * active tab, the dot indicators, and the fallback alt text in sync.
 */
export interface GalleryImage {
	id: number
	url: string
	caption: string | null
	/** Index of the owning section, so navigation can follow the active tab. */
	sectionIndex: number
	/** Position within the owning section, for the section-scoped dots. */
	localIndex: number
	/** Owning section's title, used for the fallback alt when a caption is absent. */
	sectionTitle: string
}

/** The minimum a section needs to expose for {@link flattenSections}. */
interface FlattenableSection {
	title: string
	images: { id: number; url: string; caption: string | null }[]
}

/**
 * Flattens every section's images into one ordered gallery. Image-less sections
 * contribute nothing (their `map` over `[]` is empty), so the gallery only ever
 * holds real slides while the tabs still list those sections for their prose.
 */
export function flattenSections(
	sections: FlattenableSection[]
): GalleryImage[] {
	return sections.flatMap((section, sectionIndex) =>
		section.images.map((image, localIndex) => ({
			id: image.id,
			url: image.url,
			caption: image.caption,
			sectionIndex,
			localIndex,
			sectionTitle: section.title,
		}))
	)
}

/**
 * Flat index of the first slide belonging to `sectionIndex`, or `-1` when that
 * section has no images. Used to jump the continuous track to a section when its
 * tab is clicked.
 */
export function firstIndexOfSection(
	images: GalleryImage[],
	sectionIndex: number
): number {
	return images.findIndex((image) => image.sectionIndex === sectionIndex)
}

/** Resolves the fallback-aware alt text for a slide. */
export function galleryImageAlt(image: GalleryImage): string {
	return image.caption ?? `${image.sectionTitle} screenshot`
}
