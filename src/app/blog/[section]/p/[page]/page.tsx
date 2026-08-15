import { notFound } from "next/navigation"
import BlogPostList from "@/components/blog/BlogPostList"
import { feedLinkForSection } from "@/lib/content/feed"
import { buildPageMetadata } from "@/lib/content/metadata"
import { getPostsBySection } from "@/lib/db/posts"
import { capitalizeSection, isValidSection, SECTIONS } from "@/lib/db/sections"
import { parsePageParam } from "@/lib/utils/format"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ section: string; page: string }>
}

/**
 * Pages 2 onward. Page 1 lives at `/blog/:section` and is redirected there from
 * `/p/1` in `next.config.ts`, so a page has exactly one canonical URL.
 *
 * `dynamicParams` is left at its default (true) on purpose: publishing a post
 * that pushes the section from 3 pages to 4 makes `/p/4` a real URL that no
 * build has seen. With the default it renders once on demand and then caches,
 * so a new page never depends on a redeploy.
 */
export async function generateStaticParams() {
	const perSection = await Promise.all(
		SECTIONS.map(async (section) => {
			const { totalPages } = await getPostsBySection(section)

			// From 2: page 1 is not served by this route.
			return Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => ({
				section,
				page: String(i + 2),
			}))
		})
	)

	return perSection.flat()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { section, page: pageParam } = await params

	if (!isValidSection(section)) {
		return {}
	}

	const page = parsePageParam(pageParam)
	const label = capitalizeSection(section)

	return buildPageMetadata({
		title: `${label} blog — page ${page}`,
		description: `Thoughts on ${section}.`,
		path: `/blog/${section}/p/${page}`,
		feed: feedLinkForSection(section),
	})
}

export default async function BlogListPagedPage({ params }: Props) {
	const { section, page: pageParam } = await params

	if (!isValidSection(section)) {
		notFound()
	}

	const page = parsePageParam(pageParam)

	// `parsePageParam` clamps junk to 1, which would render page 1's contents
	// under a `/p/:page` URL and duplicate `/blog/:section`. A non-numeric or
	// out-of-range segment is a bad URL, not a request for page 1.
	if (String(page) !== pageParam || page < 2) {
		notFound()
	}

	return <BlogPostList section={section} page={page} />
}
