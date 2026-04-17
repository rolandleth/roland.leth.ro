import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/db"
import type { Section } from "@/lib/sections"

export type LegacyMatch =
	| { kind: "post"; section: Section; slug: string }
	| { kind: "project"; slug: string }
	| null

/**
 * Looks up a legacy root-level slug against both posts and projects in parallel.
 * Cached briefly so crawler hammering on dead slugs doesn't repeatedly hit the
 * DB. Posts win over projects when both share a slug (unlikely but possible).
 */
export function lookupLegacySlug(slug: string): Promise<LegacyMatch> {
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
