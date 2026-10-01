import { describe, expect, it } from "vitest"
import {
	firstIndexOfSection,
	flattenSections,
	galleryImageAlt,
} from "./gallery"

const sections = [
	{
		title: "Overview",
		images: [
			{ id: 11, url: "/11.jpg", caption: "First" },
			{ id: 12, url: "/12.jpg", caption: null },
		],
	},
	// An image-less section contributes nothing to the flat gallery but still
	// exists as a tab elsewhere.
	{ title: "Pricing", images: [] },
	{
		title: "Features",
		images: [{ id: 31, url: "/31.jpg", caption: "Feature one" }],
	},
]

describe("flattenSections", () => {
	it("flattens every section's images into one ordered gallery", () => {
		const flat = flattenSections(sections)
		expect(flat.map((image) => image.id)).toEqual([11, 12, 31])
	})

	it("tags each slide with its owning section index and local position", () => {
		const flat = flattenSections(sections)
		expect(flat.map((image) => [image.sectionIndex, image.localIndex])).toEqual(
			[
				[0, 0],
				[0, 1],
				[2, 0],
			]
		)
	})

	it("carries the section title through for fallback alt text", () => {
		const flat = flattenSections(sections)
		expect(flat[2].sectionTitle).toBe("Features")
	})

	it("omits image-less sections entirely", () => {
		const flat = flattenSections(sections)
		expect(flat.some((image) => image.sectionIndex === 1)).toBe(false)
	})

	it("returns an empty gallery when no section has images", () => {
		expect(flattenSections([{ title: "Only prose", images: [] }])).toEqual([])
	})
})

describe("firstIndexOfSection", () => {
	it("returns the flat index of a section's first slide", () => {
		const flat = flattenSections(sections)
		expect(firstIndexOfSection(flat, 2)).toBe(2)
	})

	it("returns -1 for an image-less section", () => {
		const flat = flattenSections(sections)
		expect(firstIndexOfSection(flat, 1)).toBe(-1)
	})
})

describe("galleryImageAlt", () => {
	function imageWith(fields: { caption: string | null; alt?: string | null }) {
		const [image] = flattenSections([
			{ title: "Overview", images: [{ id: 1, url: "/1.jpg", ...fields }] },
		])

		return image
	}

	it("uses the caption when there is no alt", () => {
		const [first] = flattenSections(sections)
		expect(galleryImageAlt(first)).toBe("First")
	})

	it("prefers the alt over the caption", () => {
		expect(
			galleryImageAlt(
				imageWith({ caption: "Short", alt: "A long description." })
			)
		).toBe("A long description.")
	})

	it("falls back to the section title when the caption is null", () => {
		const flat = flattenSections(sections)
		expect(galleryImageAlt(flat[1])).toBe("Overview screenshot")
	})

	it("treats a blank alt or caption as unset rather than making the image decorative", () => {
		expect(galleryImageAlt(imageWith({ caption: "Caption", alt: "  " }))).toBe(
			"Caption"
		)
		expect(galleryImageAlt(imageWith({ caption: "", alt: null }))).toBe(
			"Overview screenshot"
		)
	})
})

describe("flattenSections alt", () => {
	it("carries the alt through, and null when the section image has none", () => {
		const flat = flattenSections([
			{
				title: "A",
				images: [
					{ id: 1, url: "/1.jpg", caption: null, alt: "Alt one" },
					{ id: 2, url: "/2.jpg", caption: null },
				],
			},
		])
		expect(flat.map((image) => image.alt)).toEqual(["Alt one", null])
	})
})
