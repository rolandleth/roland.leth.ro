import { notFound, permanentRedirect } from "next/navigation"
import PostContent from "@/components/blog/PostContent"
import PostMarkdownContent from "@/components/blog/PostMarkdownContent"
import ScheduledPostNotice from "@/components/blog/ScheduledPostNotice"
import JsonLdScript from "@/components/JsonLdScript"
import PageGlow from "@/components/PageGlow"
import { getSiteUrl } from "@/lib/auth/env"
import { feedLinkForSection } from "@/lib/content/feed"
import { buildPageMetadata } from "@/lib/content/metadata"
import { buildBlogPostingJsonLd } from "@/lib/content/postJsonLd"
import { resolveLegacyPostAlias } from "@/lib/db/legacyPostSlugAliases"
import { getAllPublishedPostSlugs, loadPostResolution } from "@/lib/db/posts"
import { isValidSection } from "@/lib/db/sections"
import {
	calculateReadingTime,
	formatDate,
	postDatetimeToISO,
} from "@/lib/utils/format"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ section: string; slug: string }>
}

export async function generateStaticParams() {
	const posts = await getAllPublishedPostSlugs()

	return posts.map((post) => ({ section: post.section, slug: post.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { section, slug } = await params

	if (!isValidSection(section)) {
		return {}
	}

	const resolved = await loadPostResolution(section, slug)

	if (resolved.status === "missing") {
		return {}
	}

	// A scheduled post's URL serves a 200 notice (see the page body), so it
	// carries real metadata — but `noindex`, so the placeholder never gets
	// indexed as the page's content. Regeneration flips this to the full article
	// metadata the moment the post is live.
	//
	// Routed through `buildPageMetadata` like the live branch, not hand-rolled:
	// a bare `{ title, robots }` emits no `alternates` at all and so inherits the
	// root layout's tech-feed default, which contradicts the section feed the
	// notice itself links on a `/blog/life/*` URL. No `description` and no
	// `markdownPath` — the tease is title-only by design, and the `.md` twin is
	// a stub rather than a markdown view of this page.
	if (resolved.status === "scheduled") {
		return {
			...buildPageMetadata({
				title: resolved.scheduled.title,
				path: `/blog/${section}/${slug}`,
				feed: feedLinkForSection(section),
			}),
			robots: { index: false },
		}
	}

	const { post } = resolved

	return buildPageMetadata({
		title: post.title,
		description: post.summary,
		path: `/blog/${post.section}/${post.slug}`,
		image: post.imageUrl,
		publishedTime: postDatetimeToISO(post.datetime),
		type: "article",
		markdownPath: `/blog/${post.section}/${post.slug}.md`,
		feed: feedLinkForSection(section),
	})
}

export default async function PostPage({ params }: Props) {
	const { section, slug } = await params

	if (!isValidSection(section)) {
		notFound()
	}

	const resolved = await loadPostResolution(section, slug)

	if (resolved.status !== "live") {
		// A renamed legacy slug 308s to its canonical form before anything renders
		// on the dirty URL — the scheduled notice included, so the notice is only
		// ever served from the canonical path. In-memory alias check on the
		// non-live path only; a live post never reaches it.
		const alias = resolveLegacyPostAlias(slug)

		if (alias && alias.section === section) {
			permanentRedirect(`/blog/${alias.section}/${alias.slug}`)
		}

		// A scheduled post renders a notice instead of pinning a 404; every other
		// non-live result is a real 404.
		if (resolved.status === "scheduled") {
			return (
				<ScheduledPostNotice
					title={resolved.scheduled.title}
					datetime={resolved.scheduled.datetime}
					section={section}
				/>
			)
		}

		notFound()
	}

	const { post } = resolved

	const readingTime = post.readingTime ?? calculateReadingTime(post.body)
	const jsonLd = buildBlogPostingJsonLd(post, getSiteUrl())

	return (
		<>
			<JsonLdScript data={jsonLd} />

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
