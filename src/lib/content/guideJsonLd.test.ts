import { describe, expect, it } from "vitest"
import { buildGuideArticleJsonLd } from "@/lib/content/guideJsonLd"
import type { GuideDetail } from "@/lib/db/guides"

const BASE = "https://roland.leth.ro"

function makeGuide(overrides: Partial<GuideDetail> = {}): GuideDetail {
	return {
		id: 1,
		slug: "how-to-keep-a-decision-journal",
		title: "How to keep a decision journal",
		description: "What to write down before an outcome exists, and why.",
		body: "Body.",
		projectSlug: "reckon",
		readingTime: "6 min read",
		publishedAt: new Date("2026-07-01T10:00:00.000Z"),
		updatedAt: new Date("2026-07-17T08:30:00.000Z"),
		topic: null,
		...overrides,
	}
}

// #region shape

describe("buildGuideArticleJsonLd", () => {
	it("emits an Article, not a BlogPosting — a guide is a maintained page, not a stream entry", () => {
		const jsonLd = buildGuideArticleJsonLd(makeGuide(), BASE)

		expect(jsonLd["@type"]).toBe("Article")
	})

	it("carries the headline, description, and canonical url", () => {
		const jsonLd = buildGuideArticleJsonLd(makeGuide(), BASE)

		expect(jsonLd.headline).toBe("How to keep a decision journal")
		expect(jsonLd.description).toBe(
			"What to write down before an outcome exists, and why."
		)
		expect(jsonLd.url).toBe(
			"https://roland.leth.ro/guides/how-to-keep-a-decision-journal"
		)
	})

	it("points mainEntityOfPage at the same url", () => {
		const jsonLd = buildGuideArticleJsonLd(makeGuide(), BASE)

		expect(jsonLd.mainEntityOfPage).toEqual({
			"@type": "WebPage",
			"@id": "https://roland.leth.ro/guides/how-to-keep-a-decision-journal",
		})
	})

	it("names the same Person as author and publisher", () => {
		const jsonLd = buildGuideArticleJsonLd(makeGuide(), BASE)

		expect(jsonLd.author).toEqual({
			"@type": "Person",
			name: "Roland Leth",
			url: BASE,
		})
		expect(jsonLd.publisher).toEqual(jsonLd.author)
	})
})

// #endregion

// #region dates

describe("buildGuideArticleJsonLd — dates", () => {
	it("always emits dateModified — the freshness signal these pages live on", () => {
		const jsonLd = buildGuideArticleJsonLd(makeGuide(), BASE)

		expect(jsonLd.dateModified).toBe("2026-07-17T08:30:00.000Z")
	})

	it("emits datePublished when the guide has been published", () => {
		const jsonLd = buildGuideArticleJsonLd(makeGuide(), BASE)

		expect(jsonLd.datePublished).toBe("2026-07-01T10:00:00.000Z")
	})

	it("omits datePublished but still emits dateModified for a never-published guide", () => {
		const jsonLd = buildGuideArticleJsonLd(
			makeGuide({ publishedAt: null }),
			BASE
		)

		expect(jsonLd).not.toHaveProperty("datePublished")
		// dateModified is the whole point of the builder — it must survive the
		// null-publishedAt branch, not be dropped alongside datePublished.
		expect(jsonLd.dateModified).toBe("2026-07-17T08:30:00.000Z")
	})

	// `unstable_cache` round-trips Dates through JSON, so the builder can be
	// handed ISO strings where its types claim `Date`.
	it("normalizes dates handed back from the cache as ISO strings", () => {
		const jsonLd = buildGuideArticleJsonLd(
			makeGuide({
				updatedAt: "2026-07-17T08:30:00.000Z" as unknown as Date,
				publishedAt: "2026-07-01T10:00:00.000Z" as unknown as Date,
			}),
			BASE
		)

		expect(jsonLd.dateModified).toBe("2026-07-17T08:30:00.000Z")
		expect(jsonLd.datePublished).toBe("2026-07-01T10:00:00.000Z")
	})
})

// #endregion

// #region image

describe("buildGuideArticleJsonLd — image", () => {
	it("omits image when the guide has no project to borrow one from", () => {
		const jsonLd = buildGuideArticleJsonLd(makeGuide(), BASE)

		expect(jsonLd).not.toHaveProperty("image")
	})

	it("omits image when the project resolves to none", () => {
		const jsonLd = buildGuideArticleJsonLd(makeGuide(), BASE, null)

		expect(jsonLd).not.toHaveProperty("image")
	})

	it("passes an absolute image URL through untouched", () => {
		const jsonLd = buildGuideArticleJsonLd(
			makeGuide(),
			BASE,
			"https://blob.vercel-storage.com/og.png"
		)

		expect(jsonLd.image).toBe("https://blob.vercel-storage.com/og.png")
	})

	it("absolutizes a site-relative image path", () => {
		const jsonLd = buildGuideArticleJsonLd(makeGuide(), BASE, "/images/og.png")

		expect(jsonLd.image).toBe("https://roland.leth.ro/images/og.png")
	})
})

// #endregion
