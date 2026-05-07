import Link from "next/link"
import AdminPagination from "@/components/admin/AdminPagination"
import { buildAdminPageUrl } from "@/lib/adminPageUrl"
import { formatDate } from "@/lib/format"
import { listPostsForAdmin } from "@/lib/posts"

interface Props {
	query: string
	page: number
}

export default async function PostsTab({ query, page }: Props) {
	const isSearching = query.length > 0
	const { posts, totalCount, totalPages } = await listPostsForAdmin({
		query,
		page,
	})

	const urlForPage = (p: number) =>
		buildAdminPageUrl({ tab: "posts", query, page: p })

	return (
		<section>
			<div className="mb-4 flex items-center justify-between">
				<p className="text-secondary text-xs">
					{isSearching
						? `${totalCount} result${totalCount === 1 ? "" : "s"}`
						: `${totalCount} posts`}
				</p>
				<Link
					href="/admin/posts/new"
					className="text-accent text-sm transition-opacity hover:opacity-75"
				>
					New post
				</Link>
			</div>

			<div className="divide-border divide-y">
				{posts.map((post) => (
					<div key={post.id} className="flex items-center justify-between py-3">
						<div>
							<p className="text-primary text-sm font-medium">{post.title}</p>
							<p className="text-secondary mt-0.5 text-xs">
								{post.section} · {formatDate(post.datetime)}
								{!post.published && " · Draft"}
							</p>
						</div>
						<Link
							href={`/admin/posts/${post.id}/edit`}
							className="text-secondary hover:text-primary text-xs transition-colors"
						>
							Edit
						</Link>
					</div>
				))}

				{posts.length === 0 && (
					<p className="text-secondary py-4 text-sm">
						{isSearching ? `No results for "${query}".` : "No posts yet."}
					</p>
				)}
			</div>

			<AdminPagination
				page={page}
				totalPages={totalPages}
				urlForPage={urlForPage}
			/>
		</section>
	)
}
