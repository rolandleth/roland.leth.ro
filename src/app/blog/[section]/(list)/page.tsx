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

// `SECTIONS` is a compile-time constant, so the generated set is already every
// section that can exist — an unknown one is always a bad URL, never content
// added since the build.
//
// Left at the default (true), an unknown section is rendered on demand instead,
// and that render is a *static generation*: it produces a cacheable output, and
// a static output carries no per-request status. The `notFound()` below then
// bakes the 404 page as an ordinary 200 — a soft 404 that invites crawlers to
// index junk (`/blog/wat` returned 200 in production on 2026-08-17). Turning
// `dynamicParams` off makes Next serve `/_not-found`, whose prerender does store
// `status: 404`, without rendering this page at all.
//
// Only safe because the param set is closed. Routes whose params come from the
// database (`[slug]`, `p/[page]`) must keep the default or new content would 404
// until the next deploy.
export const dynamicParams = false

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
