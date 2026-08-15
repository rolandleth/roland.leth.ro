import { notFound } from "next/navigation"
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
 * 404s a page past the end. Both routes are prerendered, so a page that existed
 * at build time can stop existing when a post is deleted — without this it
 * would keep serving an empty list under a URL that shouldn't resolve. Page 1
 * is exempt: an empty section is a legitimately empty list, not a missing page.
 */
export default async function BlogPostList({ section, page }: Props) {
	const { posts, totalPages } = await getPostsBySection(section, page)

	if (page > 1 && posts.length === 0) {
		notFound()
	}

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
