import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/db"
import { currentDatetimeString, postDatetimeToISO } from "@/lib/format"
import { bySection } from "@/lib/posts"
import { capitalizeSection, isValidSection, type Section } from "@/lib/sections"

/**
 * Returns the first 300 characters of a markdown body as a plain-text summary,
 * stripping leading/trailing whitespace. Used as a fallback when no summary
 * field is present on the post.
 */
function excerptFromBody(body: string): string {
	return body.trim().slice(0, 300)
}

/** Escapes characters that are special in XML to prevent feed breakage. */
function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

/**
 * Creates a cached fetcher for feed posts scoped to a single section.
 * Each section gets its own cache entry and tag so revalidation is precise:
 * invalidating `feed-tech` only busts the tech feed, not life, and vice versa.
 */
function makeFeedPostsCache(section: Section) {
	return unstable_cache(
		async () => {
			const now = currentDatetimeString()

			return prisma.post.findMany({
				where: { section, published: true, datetime: { lte: now } },
				select: {
					title: true,
					slug: true,
					section: true,
					datetime: true,
					updatedAt: true,
					body: true,
					summary: true,
				},
				orderBy: { datetime: "desc" },
				take: 20,
			})
		},
		[`feed-posts-${section}`],
		{ tags: [`feed-${section}`] }
	)
}

const feedPostsCache = bySection(makeFeedPostsCache)

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ section: string }> }
): Promise<Response> {
	const { section } = await params

	if (!isValidSection(section)) {
		return new Response("Not Found", { status: 404 })
	}

	const posts = await feedPostsCache[section]()

	const { origin: SITE_URL } = new URL(request.url)

	const feedTitle = `Roland Leth — ${capitalizeSection(section)} blog`
	const feedUrl = `${SITE_URL}/api/feed/${section}`
	const blogUrl = `${SITE_URL}/blog/${section}`
	// `<updated>` is the most recent edit across the feed entries. Feed readers
	// use it to decide whether to refetch; bumping it on edits (not just new
	// posts) is what RFC 4287 asks for. An older post being edited correctly
	// advances the feed's timestamp.
	const updatedAt =
		posts.length > 0
			? new Date(
					Math.max(...posts.map((post) => post.updatedAt.getTime()))
				).toISOString()
			: new Date().toISOString()

	const entries = posts
		.map((post) => {
			const postUrl = `${SITE_URL}/blog/${post.section}/${post.slug}`
			const published = postDatetimeToISO(post.datetime)
			const updated = post.updatedAt.toISOString()
			const summary = escapeXml(post.summary ?? excerptFromBody(post.body))

			return `  <entry>
    <title>${escapeXml(post.title)}</title>
    <link href="${postUrl}" />
    <id>${postUrl}</id>
    <published>${published}</published>
    <updated>${updated}</updated>
    <summary>${summary}</summary>
  </entry>`
		})
		.join("\n")

	const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(feedTitle)}</title>
  <link href="${feedUrl}" rel="self" />
  <link href="${blogUrl}" />
  <id>${feedUrl}</id>
  <updated>${updatedAt}</updated>
${entries}
</feed>`

	return new Response(feed, {
		status: 200,
		headers: {
			"Content-Type": "application/atom+xml; charset=utf-8",
			"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
		},
	})
}
