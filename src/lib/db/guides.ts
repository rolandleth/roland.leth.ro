import { revalidateTag, unstable_cache } from "next/cache"
import { cache } from "react"
import { createBoundedWrapperCache } from "@/lib/db/boundedCache"
import { prisma } from "@/lib/db/db"
import { guideOrder } from "@/lib/db/guideMappers"
import { PAGE_SIZE } from "@/lib/utils/pagination"

// Publish state gates only the entity it sits on. A guide is listed iff
// `guide.published`; it's *grouped* iff its topic exists and is published.
// Unpublishing a topic therefore hides the hub page and dissolves the grouping,
// but its guides stay live, listed (as ungrouped), and in the sitemap — they
// each carry their own `published` flag and unpublishing the hub was never a
// statement about them. The alternative (topic state cascading to guides) would
// silently deindex live pages, which is the one outcome an SEO surface can't
// afford.

export interface GuideListItem {
	id: number
	slug: string
	title: string
	description: string
	projectSlug: string | null
	sortOrder: number
	readingTime: string | null
	updatedAt: Date
}

export interface GuideTopicSummary {
	id: number
	slug: string
	title: string
	shortDescription: string
	projectSlug: string | null
	updatedAt: Date
}

export interface GuideTopicWithGuides extends GuideTopicSummary {
	guides: GuideListItem[]
}

export interface GuidesOverview {
	topics: GuideTopicWithGuides[]
	ungrouped: GuideListItem[]
}

export interface GuideDetail {
	id: number
	slug: string
	title: string
	description: string
	body: string
	projectSlug: string | null
	readingTime: string | null
	publishedAt: Date | null
	updatedAt: Date
	/** The parent hub, or null when ungrouped OR when the topic is unpublished (its page would 404). */
	topic: { slug: string; title: string } | null
}

export interface GuideTopicDetail {
	id: number
	slug: string
	title: string
	shortDescription: string
	description: string
	projectSlug: string | null
	updatedAt: Date
	guides: GuideListItem[]
}

const guideListItemSelect = {
	id: true,
	slug: true,
	title: true,
	description: true,
	projectSlug: true,
	sortOrder: true,
	readingTime: true,
	updatedAt: true,
} as const

const guideTopicSummarySelect = {
	id: true,
	slug: true,
	title: true,
	shortDescription: true,
	projectSlug: true,
	updatedAt: true,
} as const

// #region Aggregates

/**
 * Every published topic, and every published guide with its `topicId`, in one
 * cached payload. Grouping happens at read time in `getGuidesOverview` so the
 * `/guides` index, `llms.txt`, the sitemap, and the project-page guides section
 * all share a single cache entry and a single invalidation tag.
 */
const guidesOverviewCache = unstable_cache(
	async () => {
		const [topics, guides] = await Promise.all([
			prisma.guideTopic.findMany({
				where: { published: true },
				select: guideTopicSummarySelect,
				orderBy: { title: "asc" },
			}),
			prisma.guide.findMany({
				where: { published: true },
				select: { ...guideListItemSelect, topicId: true },
				orderBy: guideOrder,
			}),
		])

		return { topics, guides }
	},
	["guides-overview"],
	{ tags: ["guides"] }
)

/**
 * Published topics (each with its published guides) plus the ungrouped
 * remainder — guides with no topic, or whose topic is unpublished (see the
 * publish-state note at the top of this file).
 *
 * simplified: groups the full guide set in memory rather than querying per
 * topic. Correct and cheap at tens of guides; if this grows into the hundreds,
 * split it into scoped queries before the payload size becomes the problem.
 */
export async function getGuidesOverview(): Promise<GuidesOverview> {
	const { topics, guides } = await guidesOverviewCache()
	const byTopicId = new Map<number, GuideListItem[]>()
	const ungrouped: GuideListItem[] = []

	for (const { topicId, ...guide } of guides) {
		if (topicId == null) {
			ungrouped.push(guide)
			continue
		}

		const existing = byTopicId.get(topicId)

		if (existing == null) {
			byTopicId.set(topicId, [guide])
		} else {
			existing.push(guide)
		}
	}

	const grouped: GuideTopicWithGuides[] = topics.map((topic) => ({
		...topic,
		guides: byTopicId.get(topic.id) ?? [],
	}))

	// A guide whose topic didn't come back published falls through to the
	// ungrouped list rather than vanishing from every listing at once.
	const publishedTopicIds = new Set(topics.map((topic) => topic.id))

	for (const [topicId, topicGuides] of byTopicId) {
		if (!publishedTopicIds.has(topicId)) {
			ungrouped.push(...topicGuides)
		}
	}

	ungrouped.sort(compareGuides)

	return { topics: grouped, ungrouped }
}

/** Mirrors the DB's `guideOrder` for lists re-sorted in memory after regrouping. */
function compareGuides(a: GuideListItem, b: GuideListItem): number {
	return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)
}

/** Every published guide in an overview, grouped or not — the sitemap/llms.txt set. */
export function allGuides(overview: GuidesOverview): GuideListItem[] {
	return [
		...overview.topics.flatMap((topic) => topic.guides),
		...overview.ungrouped,
	]
}

/**
 * The topics and ungrouped guides attached to one project, for the guides
 * section on its detail page. Filters the shared overview rather than issuing
 * its own query — same volume reasoning as `getGuidesOverview`, and it keeps
 * the project page on the single `guides` tag.
 */
export async function getGuidesForProject(
	projectSlug: string
): Promise<GuidesOverview> {
	const { topics, ungrouped } = await getGuidesOverview()

	return {
		topics: topics.filter((topic) => topic.projectSlug === projectSlug),
		ungrouped: ungrouped.filter((guide) => guide.projectSlug === projectSlug),
	}
}

// #endregion

// #region Detail pages

// One cache wrapper per slug, built lazily and reused, so each page keeps its
// own revalidation tag without paying "new wrapper per call". Bounded so 404
// probes against arbitrary slugs can't grow the map without limit — same
// pattern as `getPostBySlug` / `getProjectBySlug`.
const guideBySlugWrappers =
	createBoundedWrapperCache<() => Promise<GuideDetail | null>>()

export async function getGuideBySlug(
	slug: string
): Promise<GuideDetail | null> {
	const wrapper = guideBySlugWrappers.get(slug, () =>
		unstable_cache(
			async () => {
				// `findFirst`, not `findUnique`, so `published: true` is enforced at
				// the query boundary and the canonical URL can't serve a draft.
				const row = await prisma.guide.findFirst({
					where: { slug, published: true },
					select: {
						id: true,
						slug: true,
						title: true,
						description: true,
						body: true,
						projectSlug: true,
						readingTime: true,
						publishedAt: true,
						updatedAt: true,
						topic: {
							select: { slug: true, title: true, published: true },
						},
					},
				})

				if (row == null) {
					return null
				}

				const { topic, ...guide } = row

				// Drop the parent link when the hub isn't live — rendering it would
				// point a published page at a 404.
				return {
					...guide,
					topic:
						topic?.published === true
							? { slug: topic.slug, title: topic.title }
							: null,
				}
			},
			[`guide-${slug}`],
			{ tags: [`guide-${slug}`, "guide-pages"] }
		)
	)

	return wrapper()
}

const guideTopicBySlugWrappers =
	createBoundedWrapperCache<() => Promise<GuideTopicDetail | null>>()

export async function getGuideTopicBySlug(
	slug: string
): Promise<GuideTopicDetail | null> {
	const wrapper = guideTopicBySlugWrappers.get(slug, () =>
		unstable_cache(
			() =>
				prisma.guideTopic.findFirst({
					where: { slug, published: true },
					select: {
						id: true,
						slug: true,
						title: true,
						shortDescription: true,
						description: true,
						projectSlug: true,
						updatedAt: true,
						guides: {
							where: { published: true },
							select: guideListItemSelect,
							orderBy: guideOrder,
						},
					},
				}),
			[`guide-topic-${slug}`],
			{ tags: [`guide-topic-${slug}`, "guide-pages"] }
		)
	)

	return wrapper()
}

/**
 * Request-scoped dedupe so `generateMetadata` and the page body share one DB
 * hit per render.
 */
export const loadGuide = cache(async (slug: string) => getGuideBySlug(slug))

export const loadGuideTopic = cache(async (slug: string) =>
	getGuideTopicBySlug(slug)
)

// #endregion

// #region Slug uniqueness

export type SlugOwner = "guide" | "topic"

/**
 * Which table already holds `slug`, or null when it's free. Guides and topics
 * share one flat `/guides/:slug` namespace across two tables, and Postgres has
 * no cross-table unique constraint — so this is the enforcement point, called
 * by the admin write routes and the import planner alike.
 *
 * `ignore` excludes the row being updated, so re-saving a guide without
 * touching its slug doesn't collide with itself.
 *
 * Inherently racy: two concurrent creates can both see a free slug. The
 * per-table `@@unique` still catches the same-table case (surfacing as a 409);
 * only a simultaneous guide-and-topic create of the same slug slips through,
 * which needs a single admin racing themselves in two tabs. Not worth an
 * advisory lock at single-author volume.
 */
export async function findSlugOwner(
	slug: string,
	ignore?: { kind: SlugOwner; id: number }
): Promise<SlugOwner | null> {
	const [guide, topic] = await Promise.all([
		prisma.guide.findUnique({ where: { slug }, select: { id: true } }),
		prisma.guideTopic.findUnique({ where: { slug }, select: { id: true } }),
	])

	if (guide != null && !(ignore?.kind === "guide" && ignore.id === guide.id)) {
		return "guide"
	}

	if (topic != null && !(ignore?.kind === "topic" && ignore.id === topic.id)) {
		return "topic"
	}

	return null
}

// #endregion

// #region Admin

export const loadGuideForAdmin = cache(async (id: number) =>
	prisma.guide.findUnique({ where: { id } })
)

export const loadGuideTopicForAdmin = cache(async (id: number) =>
	prisma.guideTopic.findUnique({ where: { id } })
)

export interface AdminGuideListItem extends GuideListItem {
	published: boolean
	topic: { slug: string; title: string } | null
}

export interface AdminGuideListResult {
	guides: AdminGuideListItem[]
	totalCount: number
	totalPages: number
}

/**
 * Guides for the admin dashboard: all of them, drafts included, uncached so
 * edits surface immediately. When `query` is non-empty, matches title OR body
 * case-insensitively (mirrors `listPostsForAdmin`).
 */
export async function listGuidesForAdmin({
	query,
	page,
}: {
	query?: string
	page: number
}): Promise<AdminGuideListResult> {
	const term = query?.trim() ?? ""
	const where =
		term.length > 0
			? {
					OR: [
						{ title: { contains: term, mode: "insensitive" as const } },
						{ body: { contains: term, mode: "insensitive" as const } },
					],
				}
			: {}

	const [guides, totalCount] = await Promise.all([
		prisma.guide.findMany({
			where,
			select: {
				...guideListItemSelect,
				published: true,
				topic: { select: { slug: true, title: true } },
			},
			orderBy: guideOrder,
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
		}),
		prisma.guide.count({ where }),
	])

	return {
		guides,
		totalCount,
		totalPages: Math.ceil(totalCount / PAGE_SIZE),
	}
}

export interface AdminGuideTopicListItem extends GuideTopicSummary {
	published: boolean
	guideCount: number
}

/**
 * Topics for the admin dashboard, drafts included and uncached. Carries
 * `guideCount` so the delete affordance can warn before hitting the `Restrict`
 * FK — a topic with guides can't be deleted, and finding that out via a 500
 * would be a poor trade for one `_count`.
 */
export async function listGuideTopicsForAdmin(): Promise<
	AdminGuideTopicListItem[]
> {
	const topics = await prisma.guideTopic.findMany({
		select: {
			...guideTopicSummarySelect,
			published: true,
			_count: { select: { guides: true } },
		},
		orderBy: { title: "asc" },
	})

	return topics.map(({ _count, ...topic }) => ({
		...topic,
		guideCount: _count.guides,
	}))
}

/** Topic slug/title/id list for the admin guide form's topic picker. */
export async function listGuideTopicOptions(): Promise<
	{ id: number; slug: string; title: string; projectSlug: string | null }[]
> {
	return prisma.guideTopic.findMany({
		select: { id: true, slug: true, title: true, projectSlug: true },
		orderBy: { title: "asc" },
	})
}

// #endregion

// #region Revalidation

/**
 * Busts the shared aggregate: the `/guides` index, `llms.txt`, the sitemap, and
 * every project page's guides section. Every guide/topic mutation goes through
 * this, directly or via the helpers below.
 */
export function revalidateGuides(): void {
	revalidateTag("guides", "max")
}

/** One guide's detail page plus the aggregates. Leaves sibling guide pages alone. */
export function revalidateGuide(slug: string): void {
	revalidateTag(`guide-${slug}`, "max")
	revalidateGuides()
}

/**
 * One topic's hub page plus the aggregates. `guideSlugs` are the guides in that
 * topic: their detail pages render the parent link, which appears or disappears
 * with the topic's publish state, so they have to be busted alongside the hub.
 * Callers pass the topic's current guide slugs; an empty list is correct for a
 * topic with none.
 */
export function revalidateGuideTopic(
	slug: string,
	guideSlugs: readonly string[] = []
): void {
	revalidateTag(`guide-topic-${slug}`, "max")

	for (const guideSlug of guideSlugs) {
		revalidateTag(`guide-${guideSlug}`, "max")
	}

	revalidateGuides()
}

/**
 * Every guide and topic detail page (via the shared `guide-pages` tag, which
 * only this path busts) plus the aggregates. For the admin revalidate endpoint
 * after a script import — those write via Prisma directly and can't bust tags
 * themselves.
 */
export function revalidateAllGuides(): void {
	revalidateTag("guide-pages", "max")
	revalidateGuides()
}

// #endregion
