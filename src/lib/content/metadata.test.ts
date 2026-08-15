import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
	buildPageMetadata,
	defaultOgImage,
	OG_IMAGE_HEIGHT,
	OG_IMAGE_WIDTH,
	ogImageEntry,
	siteOpenGraph,
	siteTwitter,
} from "@/lib/content/metadata"

// The descriptor `buildPageMetadata` is expected to emit for the site card,
// written out rather than built with `ogImageEntry`: this file is where that
// shape is pinned, and calling the helper to check the helper would pass no
// matter what it returned. The page-level suites use `ogImageEntry` instead,
// since their subject is *which* image, not what shape it takes.
const defaultCard = {
	url: defaultOgImage,
	width: OG_IMAGE_WIDTH,
	height: OG_IMAGE_HEIGHT,
	alt: "Roland Leth — iOS developer & full-stack engineer",
}

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
	// `summary_large_image` from a non-empty `images`), so this pins the spread
	// itself rather than the inference that happens to agree with it.
	it("carries the card type explicitly, not by inference from images", () => {
		const meta = buildPageMetadata({ title: "x", path: "/x", image: null })
		expect(meta.twitter).toMatchObject({ card: "summary_large_image" })
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

	// These two guard an old regression that produced `images: [null]`. The
	// fallback now fills the same slot, so the assertion moves from "undefined"
	// to "the default" — a null element would still fail both.
	it("falls back to the default card when no image is provided", () => {
		const metaMissing = buildPageMetadata({ title: "x", path: "/x" })
		expect(metaMissing.openGraph?.images).toEqual([defaultCard])
		expect(metaMissing.twitter?.images).toEqual([defaultCard])
	})

	it("falls back to the default card when image is null", () => {
		const meta = buildPageMetadata({
			title: "x",
			path: "/x",
			image: null,
		})
		expect(meta.openGraph?.images).toEqual([defaultCard])
		expect(meta.twitter?.images).toEqual([defaultCard])
	})

	// `""` resolves against `metadataBase` to the site root, so it doesn't just
	// skip the card — it advertises an HTML document as the image. Worse than
	// the imageless card the default exists to fix, and invisible without a
	// share debugger. `??` alone doesn't catch it: `"" ?? default` is `""`.
	it.each([
		["empty", ""],
		["whitespace-only", "   "],
	])("falls back to the default card when image is %s", (_label, image) => {
		const meta = buildPageMetadata({ title: "x", path: "/x", image })
		expect(meta.openGraph?.images).toEqual([defaultCard])
		expect(meta.twitter?.images).toEqual([defaultCard])
	})

	// The promise `card: "summary_large_image"` makes. An imageless large-image
	// card is a degraded card, so no page may resolve to an empty `images`.
	// Asserted as exact arrays, not lengths: `toHaveLength(1)` passes for
	// `[""]`, `[undefined]`, and any wrong entry.
	it("never emits an imageless large-image card", () => {
		const cases: [string | null | undefined, object][] = [
			[undefined, defaultCard],
			[null, defaultCard],
			["", defaultCard],
			["   ", defaultCard],
			["/images/a.png", { url: "/images/a.png" }],
		]

		for (const [image, expected] of cases) {
			const meta = buildPageMetadata({ title: "x", path: "/x", image })

			expect(meta.openGraph?.images).toEqual([expected])
			expect(meta.twitter?.images).toEqual([expected])
		}
	})

	// Two `images` keys built from one string, not one array instance shared
	// between them: aliasing is invisible at both call sites, and a future
	// per-surface normalization would silently reach both.
	it("does not share one array instance between openGraph and twitter", () => {
		const meta = buildPageMetadata({ title: "x", path: "/x" })

		expect(meta.openGraph?.images).not.toBe(meta.twitter?.images)
	})

	it("wraps a provided image in a single-element array", () => {
		const meta = buildPageMetadata({
			title: "x",
			path: "/x",
			image: "https://example.com/hero.png",
		})
		expect(meta.openGraph?.images).toEqual([
			{ url: "https://example.com/hero.png" },
		])
		expect(meta.twitter?.images).toEqual([
			{ url: "https://example.com/hero.png" },
		])
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

// #region committed asset

describe("defaultOgImage", () => {
	it("is a root-relative path, so it resolves against metadataBase", () => {
		expect(defaultOgImage.startsWith("/")).toBe(true)
	})

	// `card: "summary_large_image"` promises a 1200×630 image on every page, and
	// nothing else on the site checks the bytes: a missing or wrong-size file
	// leaves the metadata perfectly well-formed while every social preview
	// degrades. Read the header rather than just `existsSync` — "some file is
	// there" is the assertion that passes right up until it matters.
	//
	// PNG layout: 8-byte signature, then the IHDR chunk — 4-byte length, the
	// "IHDR" tag, then width and height as big-endian uint32 at offsets 16 and 20.
	it("points at a PNG in public/ matching the advertised dimensions", () => {
		const filePath = path.join(process.cwd(), "public", defaultOgImage)
		const bytes = readFileSync(filePath)

		expect(
			bytes.subarray(0, 8).toString("hex"),
			`${defaultOgImage} is not a PNG`
		).toBe("89504e470d0a1a0a")
		expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR")
		expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
			OG_IMAGE_WIDTH,
			OG_IMAGE_HEIGHT,
		])
	})
})

// #endregion

// #region image descriptors

describe("ogImageEntry", () => {
	// The dimensions let a scraper choose the large-card layout without fetching
	// the bytes; the alt is what a screen reader announces for a shared link.
	it("describes the default card fully", () => {
		expect(ogImageEntry(defaultOgImage)).toEqual({
			url: defaultOgImage,
			width: OG_IMAGE_WIDTH,
			height: OG_IMAGE_HEIGHT,
			alt: expect.any(String),
		})
	})

	// A Blob upload of unknown size with no stored description. Stamping the
	// default's dimensions on it would advertise a size that isn't true.
	it("claims nothing but the URL for a page-supplied image", () => {
		expect(ogImageEntry("https://blob.example/shot.png")).toEqual({
			url: "https://blob.example/shot.png",
		})
	})

	it("returns a fresh object per call, so the two metadata keys can't alias", () => {
		expect(ogImageEntry(defaultOgImage)).not.toBe(ogImageEntry(defaultOgImage))
	})

	it("carries the descriptor through buildPageMetadata's fallback", () => {
		const meta = buildPageMetadata({ title: "x", path: "/x" })

		expect(meta.openGraph?.images).toEqual([
			{
				url: defaultOgImage,
				width: OG_IMAGE_WIDTH,
				height: OG_IMAGE_HEIGHT,
				alt: expect.any(String),
			},
		])
	})
})

// #endregion
