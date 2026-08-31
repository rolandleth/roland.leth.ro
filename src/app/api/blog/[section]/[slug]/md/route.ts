import { getSiteUrl } from "@/lib/auth/env"
import { buildPostMarkdownFile } from "@/lib/content/postMarkdown"
import {
	getAllPublishedPostSlugs,
	loadPost,
	loadScheduledPost,
} from "@/lib/db/posts"
import { isValidSection } from "@/lib/db/sections"
import { formatDate } from "@/lib/utils/format"

// Raw-markdown view of a blog post, reached at `/blog/:section/:slug.md` — the
// `next.config.ts` rewrite points that pretty URL here because a `route.ts`
// can't share a path with the post `page.tsx`. Mirrors the page's visibility
// guards (section validation + `loadPost`'s published + `datetime <= now`
// filtering) so the `.md` view can never expose a post the HTML page hides. A
// miss is a plain 404: the legacy-slug alias redirect is an HTML-only concern
// (no `.md` links predate this route), so it's intentionally not mirrored here.

// Prerendered per post, same as the post's own page. Route handlers are dynamic
// by default, hence the explicit opt-in. Two things follow from it:
//
// - No function runs on the rewrite hit; the prerendered body is served directly.
// - `getPostBySlug`'s `post-{section}-{slug}` and `post-pages` tags ride up onto
//   the route-cache entry, so `revalidatePost` regenerates this on an admin save.
//   The hand-set `Cache-Control: s-maxage=3600` this replaced could not be
//   purged by a tag bust, so an edited post served stale markdown for up to an
//   hour — the same defect the feed route carried before it went `force-static`.
//
// Deliberately no `revalidate`: see the feed route for why a time window is the
// wrong tool for scheduled posts, and `/api/cron/revalidate-scheduled` for the
// mechanism that replaced it.
export const dynamic = "force-static"

// Mirrors the post page's own `generateStaticParams` (same `getAllPublishedPostSlugs`
// source) so the `.md` and HTML views of a post are always generated as a pair.
// Scheduled posts are filtered out at this stage; `dynamicParams` stays at its
// default (true) so one renders on demand once its `datetime` passes, rather
// than waiting for a redeploy.
export async function generateStaticParams() {
	const posts = await getAllPublishedPostSlugs()

	return posts.map((post) => ({ section: post.section, slug: post.slug }))
}

interface RouteContext {
	params: Promise<{ section: string; slug: string }>
}

/** Plain-text 404, matching the machine-facing shape the feed route uses. */
function notFoundResponse(): Response {
	return new Response("Not Found", {
		status: 404,
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	})
}

export async function GET(
	_request: Request,
	{ params }: RouteContext
): Promise<Response> {
	const { section, slug } = await params

	if (!isValidSection(section)) {
		return notFoundResponse()
	}

	const post = await loadPost(section, slug)

	if (!post) {
		const scheduled = await loadScheduledPost(section, slug)

		// Mirrors the HTML page's scheduled notice: a 200 with a stub body rather
		// than a 404, `X-Robots-Tag` standing in for the page's `noindex` metadata
		// (a markdown body has nowhere to carry robots meta). Prerendered under
		// the same tags via the shared cached row, so the same cron bust replaces
		// it with the real markdown.
		if (scheduled) {
			const body = `# ${scheduled.title}\n\nScheduled: this post goes live on ${formatDate(scheduled.datetime)}.\n`

			return new Response(body, {
				status: 200,
				headers: {
					"Content-Type": "text/markdown; charset=utf-8",
					"X-Robots-Tag": "noindex",
				},
			})
		}

		return notFoundResponse()
	}

	const body = buildPostMarkdownFile(post, getSiteUrl())

	// No hand-set `Cache-Control`: the route is statically cached, so the platform
	// manages edge caching and the tag bust above governs freshness.
	return new Response(body, {
		status: 200,
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
		},
	})
}
