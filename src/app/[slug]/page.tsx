import { notFound, permanentRedirect } from "next/navigation"
import { lookupLegacySlug } from "@/lib/legacySlug"

interface Props {
	params: Promise<{ slug: string }>
}

/**
 * Root-level catch-all that handles legacy URLs (e.g. pre-restructure posts
 * that lived at `/:slug`). Matches only when no static top-level route takes
 * precedence, so `/about`, `/admin`, `/blog`, etc. never reach this handler.
 *
 * On a hit, `permanentRedirect()` issues a 308 to the canonical URL (preserves
 * SEO signal from the old URL). On a miss, `notFound()` renders
 * `src/app/not-found.tsx` with the full site chrome — this replaces an
 * earlier `/api/legacy-redirect/[slug]` handler that surfaced raw JSON to the
 * browser on miss.
 */
export default async function LegacySlugPage({ params }: Props) {
	const { slug } = await params

	let match: Awaited<ReturnType<typeof lookupLegacySlug>> = null

	try {
		match = await lookupLegacySlug(slug)
	} catch (error) {
		// A DB outage during legacy-slug lookup would otherwise render the
		// default Next error page (500). A 404-styled miss is a strictly better
		// UX for the visitor: the page still offers navigation back to the site.
		// eslint-disable-next-line no-console
		console.error("[page:[slug]] lookupLegacySlug failed for", slug, error)
	}

	if (match?.kind === "post") {
		permanentRedirect(`/blog/${match.section}/${match.slug}`)
	}

	if (match?.kind === "project") {
		permanentRedirect(`/projects/${match.slug}`)
	}

	notFound()
}
