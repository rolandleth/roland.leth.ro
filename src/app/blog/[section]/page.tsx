import { notFound } from "next/navigation"
import AnimatedCard from "@/components/AnimatedCard"
import BlogSectionHeader from "@/components/blog/BlogSectionHeader"
import Pagination from "@/components/blog/Pagination"
import PostCard from "@/components/blog/PostCard"
import PageGlow from "@/components/PageGlow"
import { buildPageMetadata } from "@/lib/content/metadata"
import { getPostsBySection } from "@/lib/db/posts"
import { capitalizeSection, isValidSection, SECTIONS } from "@/lib/db/sections"
import { parsePageParam } from "@/lib/utils/format"
import type { Metadata } from "next"

export function generateStaticParams() {
	return SECTIONS.map((section) => ({ section }))
}

interface Props {
	params: Promise<{ section: string }>
	searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { section } = await params

	if (!isValidSection(section)) {
		return {}
	}

	const label = capitalizeSection(section)

	return buildPageMetadata({
		title: `${label} blog`,
		description: `Thoughts on ${section}.`,
		path: `/blog/${section}`,
	})
}

export default async function BlogListPage({ params, searchParams }: Props) {
	const { section } = await params
	const { page: pageParam } = await searchParams

	if (!isValidSection(section)) {
		notFound()
	}

	const page = parsePageParam(pageParam)
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
