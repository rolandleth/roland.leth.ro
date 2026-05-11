import Link from "next/link"

interface Props {
	page: number
	totalPages: number
	urlForPage: (page: number) => string
}

/**
 * Compact previous/next pager for the admin dashboard. Identical chrome was
 * inlined twice (PostsTab, ProjectsTab); centralised here so pagination
 * styling stays in sync.
 */
export default function AdminPagination({
	page,
	totalPages,
	urlForPage,
}: Props) {
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
