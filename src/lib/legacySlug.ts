import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/db"
import { currentDatetimeString } from "@/lib/format"
import type { Section } from "@/lib/sections"

export type LegacyMatch =
	| { kind: "post"; section: Section; slug: string }
	| { kind: "project"; slug: string }
	| null

// Instantiated once at module load. The `slug` argument is part of the cache
// key, so every distinct slug gets its own entry without re-wrapping on each
// call (which would defeat memoization and spam revalidation logs).
const cachedLookup = unstable_cache(
	async (slug: string): Promise<LegacyMatch> => {
		// Same `datetime <= now` snapshot as `getPostBySlug` / sitemap /
		// generateStaticParams — without it a future-dated published post whose
		// slug matches a legacy URL 308-redirects to a canonical page that itself
		// 404s on the same filter, giving inconsistent UX.
		const now = currentDatetimeString()
		const [post, project] = await Promise.all([
			prisma.post.findFirst({
				where: { slug, published: true, datetime: { lte: now } },
				select: { section: true, slug: true },
			}),
			prisma.project.findFirst({
				where: { slug },
				select: { slug: true },
			}),
		])

		if (post) {
			return { kind: "post", section: post.section, slug: post.slug }
		}

		if (project) {
			return { kind: "project", slug: project.slug }
		}

		return null
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
export function lookupLegacySlug(slug: string): Promise<LegacyMatch> {
	return cachedLookup(slug)
}
