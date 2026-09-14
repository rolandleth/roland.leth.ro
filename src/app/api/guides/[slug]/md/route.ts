import { getSiteUrl } from "@/lib/auth/env"
import { buildGuideMarkdownFile } from "@/lib/content/guideMarkdown"
import { allGuides, getGuidesOverview, loadGuide } from "@/lib/db/guides"

// Raw-markdown view of a guide, reached at `/guides/:slug.md` — the
// `next.config.ts` rewrite points that pretty URL here because a `route.ts`
// can't share a path with the guide `page.tsx`. Resolves through `loadGuide`,
// the same loader the page uses, so it inherits the page's visibility guards
// (published, and past its `publishedAt`) and the `.md` view can never expose
// a guide the HTML page hides.
//
// Topic hubs share the `/guides/:slug` namespace and are deliberately not
// served: a hub's body is landing copy wrapped around a rendered list, and the
// guides themselves are the reference pages an agent wants. A hub slug 404s
// here the same way an unknown one does.

// Prerendered per guide, same as the guide's own page. Route handlers are
// dynamic by default, hence the explicit opt-in. `getGuideBySlug`'s tags ride
// up onto the route-cache entry, so an admin save or an import's revalidate
// regenerates this alongside the page. No `revalidate`: a time window is the
// wrong tool for scheduled content — see the post `.md` route.
export const dynamic = "force-static"

// Mirrors the guide page's `generateStaticParams` for the guide half (the page
// also emits topic slugs, which this route doesn't serve), so the `.md` and
// HTML views of a guide are always generated as a pair.
export async function generateStaticParams() {
	const overview = await getGuidesOverview()

	return allGuides(overview).map((guide) => ({ slug: guide.slug }))
}

interface RouteContext {
	params: Promise<{ slug: string }>
}

/** Plain-text 404, matching the machine-facing shape the post route uses. */
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
	const { slug } = await params
	const guide = await loadGuide(slug)

	if (guide == null) {
		return notFoundResponse()
	}

	// No hand-set `Cache-Control`: the route is statically cached, so the platform
	// manages edge caching and the tag bust above governs freshness.
	return new Response(buildGuideMarkdownFile(guide, getSiteUrl()), {
		status: 200,
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
		},
	})
}
