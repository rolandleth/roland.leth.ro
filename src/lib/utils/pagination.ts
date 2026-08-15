// Shared page size for all paginated admin and public list views. Owned here
// (rather than under a specific domain like `posts`) so projects, posts, and
// any future paginated resource can reference the same value without one
// domain implicitly pulling another into its dependency graph.
export const PAGE_SIZE = 10

/**
 * Canonical URL for a page of a blog section.
 *
 * Page 1 is `/blog/:section`, not `/blog/:section/p/1` — one page, one URL. The
 * `/p/1` form is redirected to the bare path in `next.config.ts`; this helper is
 * what keeps internal links from generating it in the first place.
 */
export function blogPagePath(section: string, page: number): string {
	const base = `/blog/${section}`

	return page <= 1 ? base : `${base}/p/${page}`
}
