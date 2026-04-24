import { describe, expect, it } from "vitest"
import { buildPageMetadata } from "@/lib/metadata"

describe("buildPageMetadata", () => {
	it("returns the plain title and description at the top level", () => {
		const meta = buildPageMetadata({
			title: "Hello",
			description: "Desc",
			path: "/x",
		})
		expect(meta.title).toBe("Hello")
		expect(meta.description).toBe("Desc")
	})

	it("expands the OG title with the site suffix so template doesn't apply", () => {
		// The root layout's `title.template` only applies to `metadata.title`,
		// not to `openGraph.title`. Expanding here keeps OG previews consistent.
		const meta = buildPageMetadata({ title: "Hello", path: "/x" })
		expect(meta.openGraph?.title).toBe("Hello | Roland Leth")
		expect(meta.twitter?.title).toBe("Hello | Roland Leth")
	})

	it("defaults openGraph.type to 'website' when no type is provided", () => {
		const meta = buildPageMetadata({ title: "Hello", path: "/x" })
		const og = meta.openGraph as { type?: string }
		expect(og.type).toBe("website")
	})

	it("passes through an explicit article type", () => {
		const meta = buildPageMetadata({
			title: "Post",
			path: "/x",
			type: "article",
		})
		const og = meta.openGraph as { type?: string }
		expect(og.type).toBe("article")
	})

	it("leaves images undefined when no image is provided", () => {
		// A previous regression produced `images: [null]` when image was null;
		// assert both the undefined image and null image cases produce undefined.
		const metaMissing = buildPageMetadata({ title: "x", path: "/x" })
		expect(metaMissing.openGraph?.images).toBeUndefined()
		expect(metaMissing.twitter?.images).toBeUndefined()
	})

	it("leaves images undefined when image is null", () => {
		const meta = buildPageMetadata({
			title: "x",
			path: "/x",
			image: null,
		})
		expect(meta.openGraph?.images).toBeUndefined()
		expect(meta.twitter?.images).toBeUndefined()
	})

	it("wraps a provided image in a single-element array", () => {
		const meta = buildPageMetadata({
			title: "x",
			path: "/x",
			image: "https://example.com/hero.png",
		})
		expect(meta.openGraph?.images).toEqual(["https://example.com/hero.png"])
		expect(meta.twitter?.images).toEqual(["https://example.com/hero.png"])
	})

	it("passes through publishedTime to openGraph", () => {
		const meta = buildPageMetadata({
			title: "x",
			path: "/x",
			publishedTime: "2024-06-15T09:00:00.000Z",
		})
		const og = meta.openGraph as { publishedTime?: string }
		expect(og.publishedTime).toBe("2024-06-15T09:00:00.000Z")
	})
})
