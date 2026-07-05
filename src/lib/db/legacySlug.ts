import { resolveLegacyPostAlias } from "@/lib/db/legacyPostSlugAliases"
import { getAllPublishedPostSlugs } from "@/lib/db/posts"
import { getAllProjectSlugs } from "@/lib/db/projects"
import type { Section } from "@/lib/db/sections"

export type LegacyMatch =
	| { kind: "post"; section: Section; slug: string }
	| { kind: "project"; slug: string }
	| null

/**
 * Resolves a legacy root-level slug (`/:slug`) to its canonical location, or
 * null. Everything is checked in memory — a slug that matches nothing costs an
 * index scan, never a per-slug DB query:
 *
 *   1. An explicit legacy alias (a URL the slug cleanup renamed) — a constant.
 *   2. A currently-known published post slug, resolved against the cached
 *      `getAllPublishedPostSlugs` index (the same complete list the sitemap
 *      uses). The list applies the `datetime <= now` filter, so scheduled posts
 *      aren't matched until they go live.
 *   3. A known project slug from the cached `getAllProjectSlugs` index.
 *
 * There is deliberately NO DB fallback: if the slug isn't in the alias map or
 * the cached indexes, it 404s. That keeps junk root-level traffic
 * (`/wp-login.php`, …) off Postgres entirely, and means that if the site ever
 * stops caching every post, a post outside the index 404s here by design rather
 * than triggering a probe. The indexes are the source of truth for "does this
 * slug resolve," and they're already required to be complete for the sitemap.
 *
 * Posts win over projects when both share a slug (unlikely but possible).
 */
export async function lookupLegacySlug(slug: string): Promise<LegacyMatch> {
	const alias = resolveLegacyPostAlias(slug)

	if (alias) {
		return { kind: "post", section: alias.section, slug: alias.slug }
	}

	const posts = await getAllPublishedPostSlugs()
	const post = posts.find((entry) => entry.slug === slug)

	if (post) {
		return { kind: "post", section: post.section, slug: post.slug }
	}

	const projects = await getAllProjectSlugs()

	if (projects.some((entry) => entry.slug === slug)) {
		return { kind: "project", slug }
	}

	return null
}
