import { unstable_cache } from "next/cache"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

type LegacyMatch =
	| { kind: "post"; section: string; slug: string }
	| { kind: "project"; slug: string }
	| null

/**
 * Looks up a legacy root-level slug against both posts and projects in parallel.
 * Cached briefly so crawler hammering on dead slugs doesn't repeatedly hit the DB.
 */
function lookupLegacySlug(slug: string): Promise<LegacyMatch> {
	return unstable_cache(
		async (): Promise<LegacyMatch> => {
			const [post, project] = await Promise.all([
				prisma.post.findFirst({
					where: { slug },
					select: { section: true, slug: true },
				}),
				prisma.project.findFirst({
					where: { slug },
					select: { slug: true },
				}),
			])

			// Posts win over projects when both share a slug (unlikely but possible).
			if (post) {
				return { kind: "post", section: post.section, slug: post.slug }
			}

			if (project) {
				return { kind: "project", slug: project.slug }
			}

			return null
		},
		[`legacy-redirect-${slug}`],
		{ revalidate: 300, tags: [`legacy-redirect-${slug}`] }
	)()
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
	const { slug } = await params
	const base = new URL(request.url).origin

	let match: LegacyMatch

	try {
		match = await lookupLegacySlug(slug)
	} catch (error) {
		// DB blip: log so the failure is debuggable, return 500 consistent with
		// the rest of the API surface. Letting it bubble would render Next's
		// error boundary at the user's rewritten URL.
		// eslint-disable-next-line no-console
		console.error("legacy-redirect lookup failed", { slug, error })

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		)
	}

	if (match?.kind === "post") {
		return NextResponse.redirect(
			new URL(`/blog/${match.section}/${match.slug}`, base),
			301
		)
	}

	if (match?.kind === "project") {
		return NextResponse.redirect(new URL(`/projects/${match.slug}`, base), 301)
	}

	// Miss means the slug isn't legacy. The middleware rewrote the original URL
	// to this handler, so returning 404 here surfaces a proper 404 at the
	// user's URL. Redirecting to `/404` would re-enter middleware and loop,
	// since `/404` isn't a real route.
	return NextResponse.json({ error: "Not found" }, { status: 404 })
}
