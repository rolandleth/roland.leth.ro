import Link from "next/link"
import AdminPagination from "@/components/admin/AdminPagination"
import { buildAdminPageUrl } from "@/lib/adminPageUrl"
import { currentDatetimeString, formatDate } from "@/lib/format"
import { listPostsForAdmin } from "@/lib/posts"
import PostPublishedToggle from "@/components/admin/PostPublishedToggle"

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

	const now = currentDatetimeString()

	return (
		<section>
			<div className="mb-4 flex items-center justify-between">
				<p className="text-secondary text-xs">
					{isSearching
						? `${totalCount} result${totalCount === 1 ? "" : "s"}`
						: `${totalCount} posts`}
				</p>
				<div className="flex items-center gap-4">
					<Link
						href="/admin/posts/bulk"
						className="text-secondary hover:text-primary text-sm transition-colors"
					>
						Bulk import
					</Link>
					<Link
						href="/admin/posts/new"
						className="text-accent text-sm transition-opacity hover:opacity-75"
					>
						New post
					</Link>
				</div>
			</div>

			<div className="divide-border divide-y">
				{posts.map((post) => {
					const isScheduled = post.published && post.datetime > now

					return (
						<div
							key={post.id}
							className="flex items-center justify-between gap-3 py-3"
						>
							<div className="flex items-center gap-3">
								<PostPublishedToggle
									postId={post.id}
									initialPublished={post.published}
								/>
								<div>
									<p className="text-primary text-sm font-medium">
										{post.title}
									</p>
									<p className="text-secondary mt-0.5 text-xs">
										{post.section} · {formatDate(post.datetime)}
										{!post.published && " · Draft"}
										{isScheduled && (
											<span className="text-accent"> · Scheduled</span>
										)}
									</p>
								</div>
							</div>
							<Link
								href={`/admin/posts/${post.id}/edit`}
								prefetch={false}
								className="text-secondary hover:text-primary text-xs transition-colors"
							>
								Edit
							</Link>
						</div>
					)
				})}

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
