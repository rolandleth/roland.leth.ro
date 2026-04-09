import { notFound } from "next/navigation"
import AnimatedPostCard from "@/components/blog/AnimatedPostCard"
import BlogSectionHeader from "@/components/blog/BlogSectionHeader"
import Pagination from "@/components/blog/Pagination"
import PostCard from "@/components/blog/PostCard"
import PageGlow from "@/components/PageGlow"
import { getPostsBySection } from "@/lib/posts"
import { isValidSection, SECTIONS } from "@/lib/sections"
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

	const label = section.charAt(0).toUpperCase() + section.slice(1)

	return {
		title: `${label} blog`,
		description: `Thoughts on ${section}.`,
		openGraph: {
			title: `${label} blog | Roland Leth`,
			description: `Thoughts on ${section}.`,
			url: `/blog/${section}`,
		},
	}
}

export default async function BlogListPage({ params, searchParams }: Props) {
	const { section } = await params
	const { page: pageParam } = await searchParams

	if (!isValidSection(section)) {
		notFound()
	}

	const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1)
	const { posts, totalPages } = await getPostsBySection(section, page)
	const label = section.charAt(0).toUpperCase() + section.slice(1)

	return (
		<main className="relative mx-auto w-full max-w-3xl px-4 py-12">
			<PageGlow />
			<BlogSectionHeader section={section} label={label} />

			<div className="divide-border divide-y">
				{posts.map((post, i) => (
					<AnimatedPostCard key={post.id} index={i}>
						<PostCard post={post} />
					</AnimatedPostCard>
				))}
			</div>

			{totalPages > 1 && (
				<Pagination page={page} totalPages={totalPages} section={section} />
			)}
		</main>
	)
}
