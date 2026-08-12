import { describe, expect, it } from "vitest"
import {
	buildPageMetadata,
	siteOpenGraph,
	siteTwitter,
} from "@/lib/content/metadata"

describe("buildPageMetadata", () => {
	// Next resolves `openGraph`/`twitter` from the page's own object and assigns
	// the result over the layout's, so a page defining either drops every field
	// it doesn't restate. That failure is invisible in review and in the rendered
	// page — it only shows up in a share debugger, which is how it was found.
	it("restates the site-wide OG fields the layout can't pass down", () => {
		const meta = buildPageMetadata({ title: "x", path: "/x" })
		expect(meta.openGraph).toMatchObject(siteOpenGraph)
	})

	it("restates the site-wide Twitter fields the layout can't pass down", () => {
		const meta = buildPageMetadata({ title: "x", path: "/x" })
		expect(meta.twitter).toMatchObject(siteTwitter)
	})

	// `card` survives by luck when images are present (Next infers
	// `summary_large_image` from a non-empty `images`), so an imageless page is
	// the case that would silently degrade to `summary` if the spread went away.
	it("carries the card type even with no image to infer it from", () => {
		const meta = buildPageMetadata({ title: "x", path: "/x", image: null })
		expect(meta.twitter).toMatchObject({ card: "summary_large_image" })
		expect(meta.twitter?.images).toBeUndefined()
	})

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

	it("passes through keywords when provided", () => {
		const meta = buildPageMetadata({
			title: "x",
			path: "/x",
			keywords: ["1:1 notes app", "manager notes app"],
		})
		expect(meta.keywords).toEqual(["1:1 notes app", "manager notes app"])
	})

	it("leaves keywords undefined when not provided", () => {
		const meta = buildPageMetadata({ title: "x", path: "/x" })
		expect(meta.keywords).toBeUndefined()
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

	it("passes through modifiedTime to openGraph", () => {
		const meta = buildPageMetadata({
			title: "x",
			path: "/x",
			modifiedTime: "2026-07-17T08:30:00.000Z",
		})
		const og = meta.openGraph as { modifiedTime?: string }
		expect(og.modifiedTime).toBe("2026-07-17T08:30:00.000Z")
	})

	it("emits a canonical link when canonicalPath is given", () => {
		const meta = buildPageMetadata({
			title: "x",
			path: "/x",
			canonicalPath: "/x",
		})
		expect(meta.alternates?.canonical).toBe("/x")
	})

	// Opt-in, not defaulted to `path`: turning canonicals on site-wide would
	// assert one for pages nobody has audited for multi-path reachability.
	it("emits no alternates at all when neither canonical nor markdown is given", () => {
		const meta = buildPageMetadata({ title: "x", path: "/x" })
		expect(meta.alternates).toBeUndefined()
	})

	it("carries canonical and markdown alternates together", () => {
		const meta = buildPageMetadata({
			title: "x",
			path: "/x",
			canonicalPath: "/x",
			markdownPath: "/x.md",
		})
		expect(meta.alternates?.canonical).toBe("/x")
		expect(meta.alternates?.types?.["text/markdown"]).toBe("/x.md")
	})

	it("emits only the markdown alternate when canonical is absent", () => {
		const meta = buildPageMetadata({
			title: "x",
			path: "/x",
			markdownPath: "/x.md",
		})
		expect(meta.alternates?.canonical).toBeUndefined()
		expect(meta.alternates?.types?.["text/markdown"]).toBe("/x.md")
	})

	it("emits a titled feed-autodiscovery alternate when feed is given", () => {
		// The descriptor (array of `{ url, title }`) is what makes Next render the
		// `title` attribute; a bare string would drop it and readers would show the
		// raw URL. Asserting the title is present is the point of this test.
		const meta = buildPageMetadata({
			title: "x",
			path: "/x",
			feed: { path: "/blog/tech/feed.xml", title: "Roland Leth — Tech blog" },
		})
		expect(meta.alternates?.types?.["application/atom+xml"]).toEqual([
			{ url: "/blog/tech/feed.xml", title: "Roland Leth — Tech blog" },
		])
	})

	it("carries markdown and feed alternates together in types", () => {
		const meta = buildPageMetadata({
			title: "x",
			path: "/x",
			markdownPath: "/x.md",
			feed: { path: "/blog/tech/feed.xml", title: "Roland Leth — Tech blog" },
		})
		expect(meta.alternates?.types?.["text/markdown"]).toBe("/x.md")
		expect(meta.alternates?.types?.["application/atom+xml"]).toEqual([
			{ url: "/blog/tech/feed.xml", title: "Roland Leth — Tech blog" },
		])
	})

	// Dev-only guard: the layout applies a `"%s | Roland Leth"` template to
	// `metadata.title`, so a caller routing a pre-branded title through this
	// helper would silently produce `"Roland Leth — Foo | Roland Leth"`. The
	// throw surfaces the misuse in dev/test where it can be caught locally,
	// without changing prod behavior.
	describe("double-brand dev guard", () => {
		it("throws when title contains 'Roland Leth' (dev/test)", () => {
			expect(() =>
				buildPageMetadata({ title: "Roland Leth — Apps", path: "/" })
			).toThrow(/already contains "Roland Leth"/)
		})

		it("does not throw for an unbranded title", () => {
			expect(() =>
				buildPageMetadata({ title: "Apps", path: "/apps" })
			).not.toThrow()
		})
	})
})
