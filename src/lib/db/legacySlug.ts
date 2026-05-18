import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/db/db"
import { currentDatetimeString } from "@/lib/utils/format"
import type { Section } from "@/lib/db/sections"

export type LegacyMatch =
	| { kind: "post"; section: Section; slug: string }
	| { kind: "project"; slug: string }
	| null

interface CachedLookup {
	post: { section: Section; slug: string; datetime: string } | null
	project: { slug: string } | null
}

// Instantiated once at module load. The `slug` argument is part of the cache
// key, so every distinct slug gets its own entry without re-wrapping on each
// call (which would defeat memoization and spam revalidation logs).
const cachedLookup = unstable_cache(
	async (slug: string): Promise<CachedLookup> => {
		// Scheduled-post handling matches `getPostBySlug` /
		// `getAllPublishedPostSlugs`: the row is cached without a `datetime
		// <= now` filter and the boundary is enforced at read time, so a
		// future-dated post's legacy alias only 308-redirects once its
		// `datetime` has passed (and the canonical page is therefore live).
		// `datetime` is added to the select for the read-time check.
		const [post, project] = await Promise.all([
			prisma.post.findFirst({
				where: { slug, published: true },
				select: { section: true, slug: true, datetime: true },
			}),
			prisma.project.findFirst({
				where: { slug },
				select: { slug: true },
			}),
		])

		return { post, project }
	},
	["legacy-redirect"],
	// Tagged with both `posts` and `projects` so the existing
	// `revalidatePostSection` / project mutation paths bust stale legacy-slug
	// entries without needing a dedicated legacy tag. Without tags a newly
	// published slug that collides with a cached miss is invisible for up to
	// `revalidate` seconds.
	{ revalidate: 300, tags: ["posts", "projects"] }
)

/**
 * Looks up a legacy root-level slug against both posts and projects in parallel.
 * Cached briefly so crawler hammering on dead slugs doesn't repeatedly hit the
 * DB. Posts win over projects when both share a slug (unlikely but possible).
 */
export async function lookupLegacySlug(slug: string): Promise<LegacyMatch> {
	const { post, project } = await cachedLookup(slug)
	const now = currentDatetimeString()

	if (post && post.datetime <= now) {
		return { kind: "post", section: post.section, slug: post.slug }
	}

	if (project) {
		return { kind: "project", slug: project.slug }
	}

	return null
}
