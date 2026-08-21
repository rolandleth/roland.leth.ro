import { notFound } from "next/navigation"
import BlogPostList from "@/components/blog/BlogPostList"
import { feedLinkForSection } from "@/lib/content/feed"
import { buildPageMetadata } from "@/lib/content/metadata"
import { getSectionPageCount } from "@/lib/db/posts"
import {
	capitalizeSection,
	isValidSection,
	SECTIONS,
	type Section,
} from "@/lib/db/sections"
import { MAX_PAGE, parsePageParam } from "@/lib/utils/format"
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
 * so a new page never depends on a redeploy — up to `MAX_PAGE`. Past it the two
 * mechanisms contradict: `resolvePage` 404s a real page at runtime, and the
 * `generateStaticParams` guard below that exists to catch exactly this can't
 * fire without a build. Not a redesign at 300 posts, but worth knowing the
 * "never depends on a redeploy" claim above has that ceiling.
 *
 * Unlike `/blog/:section`, this route can NOT take `dynamicParams = false` — its
 * param set comes from the post count, not from a compile-time constant, so
 * turning it off would 404 every page added since the last deploy.
 */
export async function generateStaticParams() {
	const perSection = await Promise.all(
		SECTIONS.map(async (section) => {
			const totalPages = await getSectionPageCount(section)

			// The corpus outgrowing `MAX_PAGE` has to fail loudly. `resolvePage`
			// below 404s anything above it, so a section that legitimately reaches
			// page 31 would start serving 404s for real pages with nothing to say
			// why. Failing the build is the cheap end of that: the fix is a one-line
			// constant bump.
			if (totalPages > MAX_PAGE) {
				throw new Error(
					`[blog] ${section} needs ${totalPages} pages but MAX_PAGE is ${MAX_PAGE}. ` +
						`Raise MAX_PAGE in src/lib/utils/format.ts.`
				)
			}

			// From 2: page 1 is not served by this route.
			return Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => ({
				section,
				page: String(i + 2),
			}))
		})
	)

	return perSection.flat()
}

/**
 * True when `raw` is a well-formed page number that `MAX_PAGE` clamped out of
 * range — as opposed to junk (`abc`, `02`, `2.5`) that fails the round-trip
 * check for unrelated reasons. The one rejection reason worth a log line: it
 * can mean the corpus outgrew `MAX_PAGE` between deploys rather than a
 * crawler probing a malformed URL, and the two are indistinguishable from a
 * bare `notFound()` alone.
 */
function isPageOverCeiling(raw: string): boolean {
	const n = Number.parseInt(raw, 10)

	return !Number.isNaN(n) && String(n) === raw && n > MAX_PAGE
}

/**
 * The page number this URL names, or `null` if it names none.
 *
 * Shared by `generateMetadata` and the page body because they used to disagree:
 * the body did the round-trip check, `generateMetadata` used the *clamped* value
 * unchecked, so `/blog/tech/p/abc` and `/p/999999` produced "page 1" metadata
 * and a `/blog/tech/p/1` path before the body 404'd fifteen lines later.
 *
 * Three rejections, cheapest first, all before any database work:
 *   - a segment that isn't exactly its own parsed form (`02`, `2abc`, `2.5`)
 *   - page 1, which belongs to `/blog/:section` and is redirected there — one
 *     of three places enforcing that rule; see the docblock on `blogPagePath`
 *     in `pagination.ts` for the other two
 *   - anything past `MAX_PAGE`, which `parsePageParam` clamps into range and the
 *     round-trip check then rejects
 */
function resolvePage(pageParam: string): number | null {
	const page = parsePageParam(pageParam)

	if (String(page) !== pageParam || page < 2) {
		if (isPageOverCeiling(pageParam)) {
			// eslint-disable-next-line no-console
			console.warn("[blog:p] page exceeds MAX_PAGE — possible stale ceiling", {
				pageParam,
			})
		}

		return null
	}

	return page
}

/**
 * Whether this URL names a page the section actually has.
 *
 * `resolvePage` bounds the number against `MAX_PAGE`; this bounds it against
 * reality. Without it `/blog/tech/p/29` is a billed on-demand render of an empty
 * list for a section with 3 pages, and every distinct probe mints its own cache
 * entry. One cached count, no post bodies.
 */
async function isRealPage(section: Section, page: number): Promise<boolean> {
	return page <= (await getSectionPageCount(section))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { section, page: pageParam } = await params

	if (!isValidSection(section)) {
		return {}
	}

	const page = resolvePage(pageParam)

	if (page === null || !(await isRealPage(section, page))) {
		return {}
	}

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

	const page = resolvePage(pageParam)

	if (page === null || !(await isRealPage(section, page))) {
		notFound()
	}

	return <BlogPostList section={section} page={page} />
}
