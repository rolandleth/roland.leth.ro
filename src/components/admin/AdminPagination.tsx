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
