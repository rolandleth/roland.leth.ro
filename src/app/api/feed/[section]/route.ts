import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/db"
import { currentDatetimeString, postDatetimeToISO } from "@/lib/format"
import { markdownToHtml, stripMarkdown } from "@/lib/markdown"
import { bySection } from "@/lib/posts"
import { capitalizeSection, isValidSection, type Section } from "@/lib/sections"

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
 * Neutralizes the CDATA section terminator inside a payload that will be wrapped
 * in `<![CDATA[ ... ]]>`. Any literal `]]>` in the HTML would otherwise close the
 * section early and break the XML; the canonical workaround is to split the
 * sequence across two CDATA sections.
 */
function escapeCdata(html: string): string {
	return html.replace(/\]\]>/g, "]]]]><![CDATA[>")
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

			const posts = await prisma.post.findMany({
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

			// Pre-render markdown and resolve the summary fallback here so the
			// handler is pure template work. Both are included in the cached
			// payload; `body` is dropped since only the derived fields are needed.
			// `updatedAt` is normalized to ISO — `unstable_cache` JSON-serializes
			// its return value, turning `Date` into a string on cache hits.
			return Promise.all(
				posts.map(async (post) => ({
					title: post.title,
					slug: post.slug,
					section: post.section,
					datetime: post.datetime,
					updatedAt: post.updatedAt.toISOString(),
					summary: post.summary ?? stripMarkdown(post.body).slice(0, 300),
					htmlBody: await markdownToHtml(post.body),
				}))
			)
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
					Math.max(...posts.map((post) => new Date(post.updatedAt).getTime()))
				).toISOString()
			: new Date().toISOString()

	const entries = posts
		.map((post) => {
			const postUrl = `${SITE_URL}/blog/${post.section}/${post.slug}`
			const published = postDatetimeToISO(post.datetime)

			return `  <entry>
    <title>${escapeXml(post.title)}</title>
    <link href="${postUrl}" />
    <id>${postUrl}</id>
    <published>${published}</published>
    <updated>${post.updatedAt}</updated>
    <summary>${escapeXml(post.summary)}</summary>
    <content type="html"><![CDATA[${escapeCdata(post.htmlBody)}]]></content>
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
