import { notFound } from "next/navigation"
import BlogPostList from "@/components/blog/BlogPostList"
import { feedLinkForSection } from "@/lib/content/feed"
import { buildPageMetadata } from "@/lib/content/metadata"
import { capitalizeSection, isValidSection, SECTIONS } from "@/lib/db/sections"
import type { Metadata } from "next"

// Page 1 of the blog list. Deliberately does NOT read `searchParams` — touching
// that API is what opts a route into dynamic rendering, and it's decided at
// build time from whether the code references it, not per request from whether
// a param is present. Reading it here would put every visit to `/blog/tech` on
// a billed invocation for the sake of a param that lives on `/blog/:section/p/:page`
// instead. Legacy `?page=N` URLs are redirected to that route in `next.config.ts`.
export function generateStaticParams() {
	return SECTIONS.map((section) => ({ section }))
}

interface Props {
	params: Promise<{ section: string }>
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
		feed: feedLinkForSection(section),
	})
}

export default async function BlogListPage({ params }: Props) {
	const { section } = await params

	if (!isValidSection(section)) {
		notFound()
	}

	return <BlogPostList section={section} page={1} />
}
