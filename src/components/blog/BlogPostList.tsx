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
 * `/p/:page` already 404s a page past the end via `isRealPage`, and `/blog/:section`
 * always requests page 1, so a page that was NEVER real never reaches here.
 * This 404 is for a page that WAS real at that check and stopped being one by
 * the time this component's own `getPostsBySection` call ran.
 *
 * `getPostsBySection`'s `totalPages` and `isRealPage`'s bound read through the
 * same cache entry (`makeBlogPageCache` in `posts.ts`), which rules out the two
 * disagreeing about where the section ends on any SINGLE read. It does not rule
 * out the entry changing value BETWEEN `isRealPage`'s read and this
 * component's: `unstable_cache` serves a stale value immediately after a bust
 * and regenerates in the background, so a post being unpublished or deleted
 * between those two reads can make `totalPages` and the actual row count
 * disagree for one request. `datetime` crossing `now` can't cause this on its
 * own — that filter is monotonic, so a fresher read only ever includes MORE
 * rows — but an unpublish or delete isn't a clock-driven change and isn't
 * monotonic.
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
