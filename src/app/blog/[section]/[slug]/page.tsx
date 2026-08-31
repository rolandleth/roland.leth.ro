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
import {
	getAllPublishedPostSlugs,
	loadPost,
	loadScheduledPost,
} from "@/lib/db/posts"
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

	const post = await loadPost(section, slug)

	if (!post) {
		const scheduled = await loadScheduledPost(section, slug)

		// A scheduled post's URL serves a 200 notice (see the page body), so it
		// carries real metadata — but `noindex`, so the placeholder never gets
		// indexed as the page's content. Regeneration flips this to the full
		// article metadata the moment the post is live.
		if (scheduled) {
			return {
				title: scheduled.title,
				robots: { index: false },
			}
		}

		return {}
	}

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

	const post = await loadPost(section, slug)

	if (!post) {
		// A renamed legacy slug 308s to its canonical form; a scheduled post
		// renders a notice instead of pinning a 404 (alias first, so an aliased
		// scheduled slug lands on its canonical URL before showing it); every
		// other miss is a real 404. In-memory alias check on the miss path only —
		// a found post never reaches it.
		const alias = resolveLegacyPostAlias(slug)

		if (alias && alias.section === section) {
			permanentRedirect(`/blog/${alias.section}/${alias.slug}`)
		}

		const scheduled = await loadScheduledPost(section, slug)

		if (scheduled) {
			return (
				<ScheduledPostNotice
					title={scheduled.title}
					datetime={scheduled.datetime}
					section={section}
				/>
			)
		}

		notFound()
	}

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
