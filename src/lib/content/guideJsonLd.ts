// Pure builder for the guide page's schema.org `Article` JSON-LD. Adapted from
// `postJsonLd.ts` rather than shared with it: the two differ in the fields that
// matter (a post's dates come from its `yyyy-MM-dd-HHmm` string and its
// `datePublished` is the point; a guide's come from real `DateTime` columns and
// its `dateModified` is the point), so a merged builder would be a pile of
// conditionals over two nearly-disjoint field sets. Kept I/O-free so the shape
// is unit-testable and the page stays a thin server component.

import { jsonLdImageUrl, personFor } from "@/lib/content/jsonLd"
import type { GuideDetail } from "@/lib/db/guides"

/**
 * Builds `Article` JSON-LD for a guide.
 *
 * `Article` rather than `BlogPosting`: a guide is a maintained reference page,
 * not a dated entry in a stream, and `BlogPosting` would tell crawlers to read
 * it as the latter.
 *
 * `dateModified` is always present — it's the freshness signal these pages live
 * on, and the one the visible "Updated" dateline mirrors. `datePublished` is
 * omitted until the row has actually been published (`publishedAt` is stamped
 * once, on first publish). Both columns may come back from `unstable_cache` as
 * ISO strings rather than `Date`s, so they're normalized through `new Date(...)`.
 *
 * `base` is the site origin from `getSiteUrl()`, passed in so the builder stays
 * pure. `image` is the project's resolved OG image (guides carry no image of
 * their own); a guide with no project falls back to the site card, matching what
 * `buildPageMetadata` puts in `og:image` for the same page. The guarantee is
 * no misattribution, not no image: a guide never borrows another product's card.
 */
export function buildGuideArticleJsonLd(
	guide: GuideDetail,
	base: string,
	image?: string | null
): Record<string, unknown> {
	const url = `${base}/guides/${guide.slug}`
	const person = personFor(base)

	const jsonLd: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": "Article",
		headline: guide.title,
		description: guide.description,
		url,
		mainEntityOfPage: { "@type": "WebPage", "@id": url },
		author: person,
		publisher: person,
		dateModified: new Date(guide.updatedAt).toISOString(),
	}

	if (guide.publishedAt != null) {
		jsonLd.datePublished = new Date(guide.publishedAt).toISOString()
	}

	// Always present: a guide with no project names the site card, the same asset
	// its `og:image` advertises. See `jsonLdImageUrl`.
	jsonLd.image = jsonLdImageUrl(image, base)

	return jsonLd
}
