import { unstable_cache } from "next/cache"
import { getSiteUrl } from "@/lib/auth/env"
import {
	FEED_AUTHOR_NAME,
	feedPathForSection,
	feedTitleForSection,
} from "@/lib/content/feed"
import { markdownToHtml } from "@/lib/content/markdown"
import { prisma } from "@/lib/db/db"
import { bySection } from "@/lib/db/posts"
import { isValidSection, type Section } from "@/lib/db/sections"
import { currentDatetimeString, postDatetimeToISO } from "@/lib/utils/format"

// The most recent N posts are included in the feed. 20 matches common reader
// defaults (e.g. Feedbin, NetNewsWire) — large enough for weekly readers to
// catch up, small enough to keep the cached payload bounded.
const FEED_ENTRY_LIMIT = 20

// Per-section feed subtitle. Explicit rather than derived from the section name
// so each reads as a real sentence in a subscriber's reader, preserving the
// wording the pre-Next feed shipped for years.
const FEED_SUBTITLES: Record<Section, string> = {
	tech: "Software development thoughts by Roland Leth",
	life: "Personal development thoughts by Roland Leth",
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
 *
 * The cached payload is padded by the current scheduled-post count: we take
 * `FEED_ENTRY_LIMIT + futureCount` rows so that the handler can filter
 * `datetime <= now` and still emit a full feed. Scheduled posts therefore
 * live inside the cache and auto-surface the first request after their
 * `datetime` passes, without waiting for a cache bust. Markdown rendering is
 * done for the future rows too — small wasted compute traded for a simpler
 * cache shape.
 */
function makeFeedPostsCache(section: Section) {
	return unstable_cache(
		async () => {
			const futureCount = await prisma.post.count({
				where: {
					section,
					published: true,
					datetime: { gt: currentDatetimeString() },
				},
			})

			const posts = await prisma.post.findMany({
				where: { section, published: true },
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
				take: FEED_ENTRY_LIMIT + futureCount,
			})

			// Pre-render markdown here so the handler is pure template work. The
			// rendered HTML is included in the cached payload; `body` is dropped
			// since only the derived fields are needed. `updatedAt` is normalized
			// to ISO — `unstable_cache` JSON-serializes its return value, turning
			// `Date` into a string on cache hits.
			return Promise.all(
				posts.map(async (post) => ({
					title: post.title,
					slug: post.slug,
					section: post.section,
					datetime: post.datetime,
					updatedAt: post.updatedAt.toISOString(),
					summary: post.summary,
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
	_request: Request,
	{ params }: { params: Promise<{ section: string }> }
): Promise<Response> {
	const { section } = await params

	if (!isValidSection(section)) {
		return new Response("Not Found", { status: 404 })
	}

	const cached = await feedPostsCache[section]()
	const now = currentDatetimeString()
	const posts = cached
		.filter((post) => post.datetime <= now)
		.slice(0, FEED_ENTRY_LIMIT)

	// Atom `<id>` elements must be stable across callers; `request.url` varies
	// with preview/proxy hosts, so feed readers would see different IDs for the
	// same entry. `getSiteUrl()` resolves to the canonical origin from env
	// (`NEXT_PUBLIC_SITE_URL`), matching `sitemap.ts` and `layout.tsx`.
	const SITE_URL = getSiteUrl()

	const feedTitle = feedTitleForSection(section)
	// `<id>` is a permanent identifier readers use to de-duplicate a feed, so it
	// stays pinned to the original `/api/feed/:section` URL — changing it would
	// orphan every existing subscription. `rel="self"` is the *current* retrieval
	// location, so it points at the canonical pretty URL that autodiscovery and
	// the middleware rewrite expose; readers converge onto it over time.
	const feedId = `${SITE_URL}/api/feed/${section}`
	const feedSelfUrl = `${SITE_URL}${feedPathForSection(section)}`
	const blogUrl = `${SITE_URL}/blog/${section}`
	const rights = `Copyright (c) 2013–${new Date().getFullYear()}, ${FEED_AUTHOR_NAME}`

	// Derive each entry's timestamps once so the entry XML and the feed-level
	// `<updated>` below draw from the same values.
	const entries = posts.map((post) => {
		const postUrl = `${SITE_URL}/blog/${post.section}/${post.slug}`
		// Fall back to `updatedAt` if the stored `datetime` is malformed; an
		// Atom `<published>null</published>` would invalidate the whole feed
		// for strict readers.
		const published =
			postDatetimeToISO(post.datetime) ?? new Date(post.updatedAt).toISOString()
		// Entry `<updated>` is the LATER of publish time and last DB edit. A
		// scheduled post is authored (its `updatedAt`) days before it publishes,
		// so keying `<updated>` off `updatedAt` alone would surface a just-live
		// post with a timestamp already in a reader's past — readers polling on
		// `<updated>` would never refetch, and never show it. Taking the max lets
		// publication itself count as the modification that advances the feed.
		const updated = new Date(
			Math.max(
				new Date(published).getTime(),
				new Date(post.updatedAt).getTime()
			)
		).toISOString()

		return { postUrl, post, published, updated }
	})

	// Feed `<updated>` tracks the most recent entry `<updated>`, so a newly
	// published scheduled post advances the whole feed, not just its own entry.
	// Falls back to now for an empty feed.
	const feedUpdated =
		entries.length > 0
			? new Date(
					Math.max(...entries.map((entry) => new Date(entry.updated).getTime()))
				).toISOString()
			: new Date().toISOString()

	const entriesXml = entries
		.map(
			({ postUrl, post, published, updated }) => `  <entry>
    <title>${escapeXml(post.title)}</title>
    <link href="${postUrl}" />
    <id>${postUrl}</id>
    <published>${published}</published>
    <updated>${updated}</updated>
    <summary>${escapeXml(post.summary)}</summary>
    <content type="html"><![CDATA[${escapeCdata(post.htmlBody)}]]></content>
  </entry>`
		)
		.join("\n")

	const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(feedTitle)}</title>
  <subtitle>${escapeXml(FEED_SUBTITLES[section])}</subtitle>
  <link href="${feedSelfUrl}" rel="self" type="application/atom+xml" />
  <link href="${blogUrl}" />
  <id>${feedId}</id>
  <updated>${feedUpdated}</updated>
  <author>
    <name>${escapeXml(FEED_AUTHOR_NAME)}</name>
    <uri>${SITE_URL}</uri>
  </author>
  <icon>${SITE_URL}/images/favicons/192x192.png</icon>
  <rights>${escapeXml(rights)}</rights>
${entriesXml}
</feed>`

	return new Response(feed, {
		status: 200,
		headers: {
			"Content-Type": "application/atom+xml; charset=utf-8",
			"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
		},
	})
}
