import type { Section } from "@/lib/db/sections"

// Shared page size for all paginated admin and public list views. Owned here
// (rather than under a specific domain like `posts`) so projects, posts, and
// any future paginated resource can reference the same value without one
// domain implicitly pulling another into its dependency graph.
export const PAGE_SIZE = 10

/**
 * Canonical URL for a page of a blog section.
 *
 * Page 1 is `/blog/:section`, not `/blog/:section/p/1` — one page, one URL. That
 * rule is enforced in three unconnected places, and this is the one a new link
 * builder should actually call rather than re-deriving the rule a fourth time:
 *   - here, for outbound links (this function)
 *   - `legacyRoutes.ts`'s `/p/1` → `/blog/:section` redirect, for an inbound URL
 *     that names page 1 the other way
 *   - `resolvePage` in `/blog/[section]/p/[page]/page.tsx`, which 404s `/p/1`
 *     rather than rendering it as a duplicate of the bare path
 *
 * `section` is a `Section`, not a `string`. This function is the single source
 * of the blog URL contract, so a widened parameter here is what would let a
 * caller mint `/blog/typo/p/2` — and every caller already holds a `Section`. The
 * import is type-only, so the module-boundary note above still holds: nothing is
 * pulled into the runtime graph.
 */
export function blogPagePath(section: Section, page: number): string {
	const base = `/blog/${section}`

	return page <= 1 ? base : `${base}/p/${page}`
}
