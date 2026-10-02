/**
 * A single screenshot flattened out of its group into one continuous gallery,
 * carrying enough context to slide across group boundaries and to keep the
 * active tab, the dot indicators, and the fallback alt text in sync. A group is
 * one carousel: a section on the tabbed layout; a section or a step on the
 * own-app product page.
 */
export interface GalleryImage {
	/**
	 * Unique across the whole gallery. Not the row id alone: the product page's
	 * images come from two tables (section images and step images), whose ids
	 * can repeat.
	 */
	key: string
	url: string
	caption: string | null
	/** Alt text when it differs from the caption; see {@link galleryImageAlt}. */
	alt: string | null
	/** Index of the owning group, so navigation can follow the active tab. */
	groupIndex: number
	/** Position within the owning group, for the group-scoped dots. */
	localIndex: number
	/** Owning group's title, used for the fallback alt when a caption is absent. */
	groupTitle: string
}

/** One carousel's worth of images, for {@link flattenGroups}. */
export interface GalleryGroup {
	title: string
	/** Prefixes each image's `key`: names the table its rows came from. */
	keyPrefix: string
	images: readonly {
		id: number
		url: string
		caption: string | null
		alt?: string | null
	}[]
}

/** The minimum a section needs to expose for {@link flattenSections}. */
interface FlattenableSection {
	title: string
	images: GalleryGroup["images"]
}

/**
 * Flattens every group's images into one ordered gallery. Image-less groups
 * contribute nothing (their `map` over `[]` is empty), so the gallery only ever
 * holds real slides.
 */
export function flattenGroups(groups: readonly GalleryGroup[]): GalleryImage[] {
	return groups.flatMap((group, groupIndex) =>
		group.images.map((image, localIndex) => ({
			key: `${group.keyPrefix}-${image.id}`,
			url: image.url,
			caption: image.caption,
			alt: image.alt ?? null,
			groupIndex,
			localIndex,
			groupTitle: group.title,
		}))
	)
}

/**
 * The tabbed layout's gallery: one group per section, so a group index is a
 * section index and the tabs still list image-less sections for their prose.
 */
export function flattenSections(
	sections: readonly FlattenableSection[]
): GalleryImage[] {
	return flattenGroups(
		sections.map((section) => ({
			title: section.title,
			keyPrefix: "section-image",
			images: section.images,
		}))
	)
}

/**
 * Flat index of the first slide belonging to `groupIndex`, or `-1` when that
 * group has no images. Used to jump the continuous track to a group when its
 * tab is clicked, or to open the lightbox on it.
 */
export function firstIndexOfGroup(
	images: readonly GalleryImage[],
	groupIndex: number
): number {
	return images.findIndex((image) => image.groupIndex === groupIndex)
}

/**
 * Resolves a slide's alt text: the alt when set, else the caption, else
 * "{group title} screenshot". Blank counts as unset. The admin form used to
 * store an empty caption as "", and an empty alt marks an image decorative,
 * which would hide a screenshot from screen readers.
 */
export function galleryImageAlt(image: GalleryImage): string {
	return (
		nonBlank(image.alt) ??
		nonBlank(image.caption) ??
		`${image.groupTitle} screenshot`
	)
}

function nonBlank(value: string | null): string | null {
	return value != null && value.trim() !== "" ? value : null
}
