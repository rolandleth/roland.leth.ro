import { notFound } from "next/navigation"
import { cache } from "react"
import PostMarkdownContent from "@/components/blog/PostMarkdownContent"
import GuideContent from "@/components/guides/GuideContent"
import GuideLinkList from "@/components/guides/GuideLinkList"
import JsonLdScript from "@/components/JsonLdScript"
import PageGlow from "@/components/PageGlow"
import { getSiteUrl } from "@/lib/auth/env"
import { buildGuideArticleJsonLd } from "@/lib/content/guideJsonLd"
import { guideToLinkItem } from "@/lib/content/guideLinks"
import { splitTopicHubBody } from "@/lib/content/guideTopicBody"
import { buildPageMetadata } from "@/lib/content/metadata"
import {
	allGuides,
	getGuidesOverview,
	loadGuide,
	loadGuideTopic,
} from "@/lib/db/guides"
import { loadProject, resolveOgImage } from "@/lib/db/projects"
import { calculateReadingTime, formatDateValue } from "@/lib/utils/format"
import type { GuideDetail, GuideTopicDetail } from "@/lib/db/guides"
import type { ProjectDetail } from "@/lib/db/projects"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ slug: string }>
}

type Resolved =
	| { kind: "guide"; guide: GuideDetail }
	| { kind: "topic"; topic: GuideTopicDetail }
	| null

/**
 * Guides and topic hubs share one flat `/guides/:slug` namespace, so this route
 * resolves against both: guide first, then topic, then 404. Cross-table slug
 * uniqueness is enforced on write (`findSlugOwner`), so the order is a
 * tiebreaker that should never actually fire.
 *
 * React-cached so `generateMetadata` and the page body resolve once per render
 * rather than twice.
 */
const resolveSlug = cache(async (slug: string): Promise<Resolved> => {
	const guide = await loadGuide(slug)

	if (guide != null) {
		return { kind: "guide", guide }
	}

	const topic = await loadGuideTopic(slug)

	if (topic != null) {
		return { kind: "topic", topic }
	}

	return null
})

/**
 * A guide carries no image of its own — its social card comes from the project
 * it supports, via the same precedence the project's own pages use. Null for a
 * guide with no project, which then ships no OG image at all rather than a
 * misleading one.
 *
 * The image is the ONLY thing the project is fetched for. The product link and
 * the disclosure that carries it are authored prose in the body: they're
 * per-guide and contextual, they sit where the argument earns them rather than
 * always last, and a boilerplate card repeated across every guide would be both
 * a weaker internal link and, worse, not a disclosure at all — it never says who
 * made the thing. `parseGuideFiles` warns when a guide names a project its body
 * never links to, which is where that guarantee lives now.
 */
async function projectFor(
	projectSlug: string | null
): Promise<ProjectDetail | null> {
	if (projectSlug == null) {
		return null
	}

	return loadProject(projectSlug)
}

export async function generateStaticParams() {
	const overview = await getGuidesOverview()

	return [
		...overview.topics.map((topic) => ({ slug: topic.slug })),
		...allGuides(overview).map((guide) => ({ slug: guide.slug })),
	]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params
	const resolved = await resolveSlug(slug)

	if (resolved == null) {
		return {}
	}

	const isGuide = resolved.kind === "guide"
	const row = isGuide ? resolved.guide : resolved.topic
	const project = await projectFor(row.projectSlug)

	return buildPageMetadata({
		title: row.title,
		description: isGuide
			? resolved.guide.description
			: resolved.topic.shortDescription,
		path: `/guides/${row.slug}`,
		// These get shared with UTM params attached — social is one of the two
		// distribution channels — so the canonical is load-bearing, not decorative.
		canonicalPath: `/guides/${row.slug}`,
		publishedTime:
			isGuide && resolved.guide.publishedAt != null
				? new Date(resolved.guide.publishedAt).toISOString()
				: undefined,
		modifiedTime: new Date(row.updatedAt).toISOString(),
		type: "article",
		image: project == null ? null : resolveOgImage(project),
	})
}

export default async function GuidePage({ params }: Props) {
	const { slug } = await params
	const resolved = await resolveSlug(slug)

	if (resolved == null) {
		notFound()
	}

	// Awaited here rather than returned as `<Guide />` / `<TopicHub />` async
	// child components: both shapes are just this page in two forms, and an
	// awaited helper renders identically while staying assertable from a test
	// (an unresolved async element only resolves inside a real RSC render).
	if (resolved.kind === "topic") {
		return renderTopicHub(resolved.topic)
	}

	return renderGuide(resolved.guide)
}

async function renderGuide(guide: GuideDetail) {
	const project = await projectFor(guide.projectSlug)
	const jsonLd = buildGuideArticleJsonLd(
		guide,
		getSiteUrl(),
		project == null ? null : resolveOgImage(project)
	)

	return (
		<>
			<JsonLdScript data={jsonLd} />

			<PageGlow />
			<GuideContent
				title={guide.title}
				formattedUpdatedAt={formatDateValue(new Date(guide.updatedAt))}
				updatedAtIso={new Date(guide.updatedAt).toISOString()}
				readingTime={guide.readingTime ?? calculateReadingTime(guide.body)}
				topic={guide.topic}
			>
				<PostMarkdownContent content={guide.body} />
			</GuideContent>
		</>
	)
}

/**
 * The topic hub reuses the guide chrome with no parent link and no reading time
 * — its body is a landing page, not an article, but it's still a maintained page
 * and wears the same "Updated" dateline.
 *
 * The body splits on its trailing `---` (see `splitTopicHubBody`): framing above
 * the guide list, disclosure below it. So the product link lands at the very
 * end, after the reader has the list, instead of interrupting the framing.
 */
async function renderTopicHub(topic: GuideTopicDetail) {
	const { intro, outro } = splitTopicHubBody(topic.description)

	return (
		<>
			<PageGlow />
			<GuideContent
				title={topic.title}
				formattedUpdatedAt={formatDateValue(new Date(topic.updatedAt))}
				updatedAtIso={new Date(topic.updatedAt).toISOString()}
				readingTime={null}
				topic={null}
			>
				<PostMarkdownContent content={intro} />

				{topic.guides.length > 0 && (
					<div className="mt-10">
						<GuideLinkList items={topic.guides.map(guideToLinkItem)} />
					</div>
				)}

				{outro != null && (
					// `border-t` stands in for the `<hr>` the split consumed, so the
					// disclosure gets the same rule-above-it look as a guide's.
					<div className="border-border mt-10 border-t pt-6">
						<PostMarkdownContent content={outro} />
					</div>
				)}
			</GuideContent>
		</>
	)
}
