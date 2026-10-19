// The database half of the check every post media delete runs first
// (`NamedElsewhere` in `@/lib/import/postMediaRun`). Next-free, like
// `projectMappers.ts`, so `scripts/import-posts.ts` and the admin delete route
// share one query.

import type { PrismaClient } from "@/generated/prisma/client"
import type { Section } from "@/lib/db/sections"
import type { NamedElsewhere } from "@/lib/import/postMediaRun"

/** The one query this needs, so a test can pass a stand-in. */
export type PostBodySearch = Pick<PrismaClient, "post">

/**
 * A `NamedElsewhere` over the posts table: which URLs some post's body names,
 * leaving out `excluding` (the post being swept on import; `null` after an
 * admin delete, whose row is already gone).
 *
 * One query per call, `contains` on each URL, which scans the bodies. A call
 * carries one post's media and runs on an import or a delete, never on a page
 * view, so the scan is a small, rare cost. The match is checked again in
 * memory, so the answer never rests on how the database reads the pattern.
 */
export function namedByOtherPosts(
	client: PostBodySearch,
	excluding: { section: Section; slug: string } | null
): NamedElsewhere {
	return async (urls) => {
		if (urls.length === 0) {
			return new Set()
		}

		const rows = await client.post.findMany({
			where: {
				OR: urls.map((url) => ({ body: { contains: url } })),
				...(excluding == null
					? {}
					: { NOT: { section: excluding.section, slug: excluding.slug } }),
			},
			select: { body: true },
		})

		return new Set(
			urls.filter((url) => rows.some((row) => row.body.includes(url)))
		)
	}
}
