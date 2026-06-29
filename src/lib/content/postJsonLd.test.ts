import { describe, expect, it } from "vitest"
import { buildBlogPostingJsonLd } from "@/lib/content/postJsonLd"
import { postDatetimeToISO } from "@/lib/utils/format"
import type { PostDetail } from "@/lib/db/posts"

const BASE = "https://roland.leth.ro"

function makePost(overrides: Partial<PostDetail> = {}): PostDetail {
	return {
		id: 1,
		title: "Hello World",
		slug: "hello-world",
		section: "tech",
		datetime: "2025-01-02-0900",
		body: "Content",
		summary: "A short summary.",
		imageUrl: null,
		readingTime: null,
		updatedAt: new Date("2025-03-04T05:06:07.000Z"),
		...overrides,
	}
}

// #region buildBlogPostingJsonLd

describe("buildBlogPostingJsonLd", () => {
	it("emits a BlogPosting with headline, description, author, and canonical url", () => {
		const result = buildBlogPostingJsonLd(makePost(), BASE)

		expect(result).toMatchObject({
			"@context": "https://schema.org",
			"@type": "BlogPosting",
			headline: "Hello World",
			description: "A short summary.",
			url: `${BASE}/blog/tech/hello-world`,
			mainEntityOfPage: {
				"@type": "WebPage",
				"@id": `${BASE}/blog/tech/hello-world`,
			},
			author: { "@type": "Person", name: "Roland Leth", url: BASE },
			publisher: { "@type": "Person", name: "Roland Leth", url: BASE },
		})
	})

	it("builds the url from the passed-in base and the post's own section", () => {
		const result = buildBlogPostingJsonLd(
			makePost({ section: "life", slug: "a-walk" }),
			"https://preview.example.com"
		)
		expect(result.url).toBe("https://preview.example.com/blog/life/a-walk")
	})

	it("sets datePublished from the stored datetime", () => {
		// Delegates to `postDatetimeToISO`, whose output is timezone-dependent
		// (it parses local-time components), so assert against the util rather
		// than a hardcoded UTC instant.
		const result = buildBlogPostingJsonLd(
			makePost({ datetime: "2024-03-15-0900" }),
			BASE
		)
		expect(result.datePublished).toBe(postDatetimeToISO("2024-03-15-0900"))
	})

	it("omits datePublished when the datetime can't be parsed", () => {
		const result = buildBlogPostingJsonLd(
			makePost({ datetime: "not-a-date" }),
			BASE
		)
		expect(result).not.toHaveProperty("datePublished")
	})

	it("normalizes dateModified from updatedAt to ISO", () => {
		const result = buildBlogPostingJsonLd(
			makePost({ updatedAt: new Date("2025-03-04T05:06:07.000Z") }),
			BASE
		)
		expect(result.dateModified).toBe("2025-03-04T05:06:07.000Z")
	})

	it("normalizes a string updatedAt (cache-serialized Date) to ISO", () => {
		// `unstable_cache` JSON-serializes its payload, so on a cache hit
		// `updatedAt` arrives as an ISO string despite the `Date` type.
		const result = buildBlogPostingJsonLd(
			makePost({ updatedAt: "2025-03-04T05:06:07.000Z" as unknown as Date }),
			BASE
		)
		expect(result.dateModified).toBe("2025-03-04T05:06:07.000Z")
	})

	it("omits image when the post has none", () => {
		expect(buildBlogPostingJsonLd(makePost(), BASE)).not.toHaveProperty("image")
	})

	it("keeps an absolute (Blob) image url unchanged", () => {
		const result = buildBlogPostingJsonLd(
			makePost({ imageUrl: "https://blob.vercel-storage.com/cover.png" }),
			BASE
		)
		expect(result.image).toBe("https://blob.vercel-storage.com/cover.png")
	})

	it("absolutizes a site-relative (legacy) image path with the base", () => {
		const result = buildBlogPostingJsonLd(
			makePost({ imageUrl: "/images/legacy/cover.png" }),
			BASE
		)
		expect(result.image).toBe(`${BASE}/images/legacy/cover.png`)
	})
})

// #endregion
