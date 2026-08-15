// Pure builder for the blog post page's schema.org `BlogPosting` JSON-LD. Kept
// I/O-free and separate from the page so the shape is unit-testable and the page
// stays a thin server component. Consumed by
// `src/app/blog/[section]/[slug]/page.tsx`.

import { jsonLdImageUrl, personFor } from "@/lib/content/jsonLd"
import { postDatetimeToISO } from "@/lib/utils/format"
import type { PostDetail } from "@/lib/db/posts"

/**
 * Builds `BlogPosting` JSON-LD for a blog post. `datePublished` comes from the
 * stored `datetime` (omitted only if it can't be parsed); `dateModified` from
 * `updatedAt`, which `unstable_cache` may hand back as an ISO string rather than
 * a `Date`, so it's normalized through `new Date(...)`. `image` is included only
 * when the post has one. These are the freshness and authorship signals Google
 * article results and AI answer engines lean on. `base` is the site origin from
 * `getSiteUrl()`, passed in so the builder stays pure.
 */
export function buildBlogPostingJsonLd(
	post: PostDetail,
	base: string
): Record<string, unknown> {
	const url = `${base}/blog/${post.section}/${post.slug}`
	const datePublished = postDatetimeToISO(post.datetime)
	const person = personFor(base)

	const jsonLd: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": "BlogPosting",
		headline: post.title,
		description: post.summary,
		url,
		mainEntityOfPage: { "@type": "WebPage", "@id": url },
		author: person,
		publisher: person,
		dateModified: new Date(post.updatedAt).toISOString(),
	}

	if (datePublished !== undefined) {
		jsonLd.datePublished = datePublished
	}

	// Always present: a post with no image of its own names the site card, the
	// same asset its `og:image` advertises. See `jsonLdImageUrl`.
	jsonLd.image = jsonLdImageUrl(post.imageUrl, base)

	return jsonLd
}
