import { notFound, redirect } from "next/navigation"
import PostContent from "@/components/blog/PostContent"
import PostMarkdownContent from "@/components/blog/PostMarkdownContent"
import PageGlow from "@/components/PageGlow"
import { feedLinkForSection } from "@/lib/content/feed"
import { buildPageMetadata } from "@/lib/content/metadata"
import { loadPostRowResolution } from "@/lib/db/posts"
import { isValidSection } from "@/lib/db/sections"
import { calculateReadingTime, formatDate } from "@/lib/utils/format"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ section: string; slug: string }>
}

// Load-bearing, not a precaution. This route reads no cookie and no request
// header, so without the flag a dynamic-param route with no
// `generateStaticParams` renders once and is then served from the full route
// cache, freezing the live-yet verdict below: the preview would keep serving
// long after the post went live instead of redirecting to it.
//
// The body is NOT what the flag buys. It comes from `fetchPostRow`'s cache
// entry, tagged `postTag(section, slug)`, and saving a post busts that tag —
// so an edit reaches this route either way. The verdict is the half with no
// tag to bust, because nothing mutates when a post's `datetime` simply passes.
export const dynamic = "force-dynamic"

/**
 * The scheduled post's body, before its `datetime` passes.
 *
 * A scheduled post's own URL serves `ScheduledPostNotice` and — deliberately —
 * a title-only teaser, because that page is prerendered and public. This route
 * renders the real thing, and is public too: the URL is the override, so
 * anyone holding it reads the post early. That is the intent (a preview link
 * you can send to someone without an account), and it is why this stays the
 * ONLY surface that overrides the schedule — the list, archive, search, feed,
 * `llms.txt`, sitemap, and the `.md` twin all keep filtering the post out until
 * it comes due, so a post is never surfaced early to someone who didn't ask for
 * this URL.
 *
 * No banner marks it as a preview. `PostContent` renders the post's date under
 * the title, and a date in the future is the signal.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { section, slug } = await params

	if (!isValidSection(section)) {
		return {}
	}

	const resolved = await loadPostRowResolution(section, slug)

	if (resolved.status === "missing") {
		return {}
	}

	// Routed through `buildPageMetadata` for the same reason the notice is: a
	// hand-rolled `{ title, robots }` emits no `alternates`, so a life post would
	// advertise the root layout's tech-feed default. `follow: false` as well as
	// `index: false` (the notice sets only the latter) — an unpublished body
	// links out, and nothing here should hand a crawler those links. No
	// `markdownPath`: the `.md` twin stays on the public route and keeps serving
	// its stub.
	return {
		...buildPageMetadata({
			title: resolved.post.title,
			path: `/blog/${section}/${slug}`,
			feed: feedLinkForSection(section),
		}),
		robots: { index: false, follow: false },
	}
}

export default async function OverridePreviewPage({ params }: Props) {
	const { section, slug } = await params

	if (!isValidSection(section)) {
		notFound()
	}

	// No session check: the URL is the override. See the docblock above — this
	// is a decision, not an omission.
	const resolved = await loadPostRowResolution(section, slug)

	if (resolved.status === "missing") {
		notFound()
	}

	// A live post already has a canonical URL and this isn't it, so send the
	// reader there rather than serving a second, `noindex` copy. 307, not 308:
	// the same slug can be re-scheduled, and a browser that cached a permanent
	// redirect would keep bouncing off this route without asking the server.
	if (resolved.status === "live") {
		redirect(`/blog/${section}/${slug}`)
	}

	// The only trace this URL leaves. Access control here is the URL itself, so
	// nothing else separates a preview link Roland sent from a probe that guessed
	// the suffix — without this line, "has anyone else found it?" has no answer
	// to grep for. Deliberately not `auditLog`: that tag enum is for admin
	// writes, and this is an anonymous public read.
	// eslint-disable-next-line no-console
	console.info("[blog:override-preview] scheduled body served", {
		section,
		slug,
	})

	const { post } = resolved
	const readingTime = post.readingTime ?? calculateReadingTime(post.body)

	// No `JsonLdScript`. `BlogPosting` structured data asserts a published
	// article at a canonical URL, and neither is true of a post that isn't out
	// yet.
	return (
		<>
			<PageGlow />
			<PostContent
				title={post.title}
				formattedDate={formatDate(post.datetime)}
				datetime={post.datetime}
				readingTime={readingTime}
			>
				<PostMarkdownContent content={post.body} />
			</PostContent>
		</>
	)
}
