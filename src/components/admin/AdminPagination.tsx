import Link from "next/link"
import { redirect } from "next/navigation"

interface Props {
	page: number
	totalPages: number
	urlForPage: (page: number) => string
}

/**
 * Compact previous/next pager for the admin dashboard. Identical chrome was
 * inlined twice (PostsTab, ProjectsTab); centralised here so pagination
 * styling stays in sync.
 *
 * Also the single place that corrects an out-of-range `page` — `page` comes
 * from `parseAdminPageParam`, which has no upper ceiling (see its docblock),
 * so `?page=5000` on a 3-page corpus used to render "5000 / 3" with a dead
 * "Previous" link and the list above printing "No posts yet." for a non-empty
 * corpus. Redirecting here, not in each tab, is what keeps the three tabs from
 * having to duplicate the check.
 *
 * That placement carries two conditions a reader can't see from here:
 *
 *   1. Every tab has to render this component unconditionally, including when
 *      its list came back empty — a tab that early-returns "No posts yet."
 *      above the pager silently loses the correction. All three
 *      (`PostsTab`, `ProjectsTab`, `GuidesTab`) render it as the last child of
 *      their list section, after the empty-state paragraph rather than instead
 *      of it.
 *   2. No Suspense boundary may sit above `/admin`. `redirect()` becomes an
 *      HTTP redirect only while nothing has flushed; under a boundary React
 *      commits the shell first and the redirect degrades to a client-side one.
 *      This is the same dependency that made `notFound()` serve a 200 in the
 *      2026-08-17 incident, and `src/app/loadingBoundaries.test.ts` is what
 *      enforces it — its final catch-all fails on any new `loading.tsx`
 *      anywhere under `src/app`, this directory included.
 *
 * The correction also runs AFTER the tab's own query, since the pager renders
 * below the list. An out-of-range `?page=` therefore pays for a `findMany` it
 * then discards. Accepted rather than fixed: skipping it needs the page count
 * before the list query, which is the per-tab duplication centralising here
 * avoided, and `parseAdminPageParam`'s `MAX_SAFE_ADMIN_PAGE` clamp already
 * bounds `skip` to something Postgres answers from an index scan over a corpus
 * this size.
 */
export default function AdminPagination({
	page,
	totalPages,
	urlForPage,
}: Props) {
	if (totalPages > 0 && page > totalPages) {
		redirect(urlForPage(totalPages))
	}

	if (totalPages <= 1) {
		return null
	}

	return (
		<nav
			aria-label="Pagination"
			className="mt-6 flex items-center justify-between"
		>
			{page > 1 ? (
				<Link
					href={urlForPage(page - 1)}
					className="text-secondary hover:text-primary text-sm transition-colors"
				>
					← Previous
				</Link>
			) : (
				<div />
			)}

			<p className="text-secondary text-xs">
				{page} / {totalPages}
			</p>

			{page < totalPages ? (
				<Link
					href={urlForPage(page + 1)}
					className="text-secondary hover:text-primary text-sm transition-colors"
				>
					Next →
				</Link>
			) : (
				<div />
			)}
		</nav>
	)
}
