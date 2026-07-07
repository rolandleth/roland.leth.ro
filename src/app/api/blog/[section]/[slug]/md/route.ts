import { getSiteUrl } from "@/lib/auth/env"
import { buildPostMarkdownFile } from "@/lib/content/postMarkdown"
import { loadPost } from "@/lib/db/posts"
import { isValidSection } from "@/lib/db/sections"

// Raw-markdown view of a blog post, reached at `/blog/:section/:slug.md` — the
// middleware rewrites that pretty URL here because a `route.ts` can't share a
// path with the post `page.tsx`. Mirrors the page's visibility guards (section
// validation + `loadPost`'s published + `datetime <= now` filtering) so the `.md`
// view can never expose a post the HTML page hides. A miss is a plain 404: the
// legacy-slug alias redirect is an HTML-only concern (no `.md` links predate this
// route), so it's intentionally not mirrored here.

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
		return notFoundResponse()
	}

	const body = buildPostMarkdownFile(post, getSiteUrl())

	return new Response(body, {
		status: 200,
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
		},
	})
}
