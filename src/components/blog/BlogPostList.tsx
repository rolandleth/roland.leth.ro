import AnimatedCard from "@/components/AnimatedCard"
import BlogSectionHeader from "@/components/blog/BlogSectionHeader"
import Pagination from "@/components/blog/Pagination"
import PostCard from "@/components/blog/PostCard"
import PageGlow from "@/components/PageGlow"
import { getPostsBySection } from "@/lib/db/posts"
import { capitalizeSection, type Section } from "@/lib/db/sections"

interface Props {
	section: Section
	page: number
}

/**
 * The blog list body, shared by `/blog/:section` (page 1) and
 * `/blog/:section/p/:page` (page 2 onward). One implementation rather than two,
 * since the pages differ only in which slice they render.
 *
 * A page past the end never reaches this component — `/p/:page` 404s it via
 * `isRealPage` before rendering, and `/blog/:section` always requests page 1,
 * which is never out of range. `getPostsBySection`'s `totalPages` and
 * `isRealPage`'s bound now read through the same cache entry (see
 * `makeBlogPageCache` in `posts.ts`), so the two can't disagree about where the
 * section ends.
 */
export default async function BlogPostList({ section, page }: Props) {
	const { posts, totalPages } = await getPostsBySection(section, page)

	const label = capitalizeSection(section)

	return (
		<div className="relative mx-auto w-full max-w-3xl px-4 py-12">
			<PageGlow />
			<BlogSectionHeader section={section} label={label} />

			<div className="divide-border divide-y">
				{posts.map((post, i) => (
					<AnimatedCard key={post.id} index={i}>
						<PostCard post={post} />
					</AnimatedCard>
				))}
			</div>

			{totalPages > 1 && (
				<Pagination page={page} totalPages={totalPages} section={section} />
			)}
		</div>
	)
}
