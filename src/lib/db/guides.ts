import { revalidateTag, unstable_cache } from "next/cache"
import { cache } from "react"
import { createBoundedWrapperCache } from "@/lib/db/boundedCache"
import { wrapNullableDetail } from "@/lib/db/cacheMiss"
import { prisma } from "@/lib/db/db"
import {
	compareGuides,
	guideOrder,
	isScheduledGuide,
} from "@/lib/db/guideMappers"
import { PAGE_SIZE } from "@/lib/utils/pagination"

// Publish state gates only the entity it sits on. A guide is listed iff
// `guide.published`; it's *grouped* iff its topic exists and is published.
// Unpublishing a topic therefore hides the hub page and dissolves the grouping,
// but its guides stay live, listed (as ungrouped), and in the sitemap — they
// each carry their own `published` flag and unpublishing the hub was never a
// statement about them. The alternative (topic state cascading to guides) would
// silently deindex live pages, which is the one outcome an SEO surface can't
// afford.
//
// Scheduling works exactly as it does for posts: `published: true` with a future
// `publishedAt` means "in the database, not yet live". The filter is applied at
// READ time, on rows the cache already holds, never inside the cached function —
// so a scheduled guide surfaces on the first request after its date passes, with
// no cron and no manual revalidate. Capturing `now` inside the cache would
// freeze the comparison at fill time and strand the guide until something else
// evicted the entry.
//
// Topics don't schedule: they have no `publishedAt` (a hub is a landing page,
// not a dated piece), so a published topic is live immediately. Its guide list
// still hides the scheduled ones.

export interface GuideListItem {
	id: number
	slug: string
	title: string
	description: string
	projectSlug: string | null
	sortOrder: number
	readingTime: string | null
	publishedAt: Date | null
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
	// Carried on list rows so every surface can apply the read-time scheduling
	// filter without a second query.
	publishedAt: true,
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
 * Aggregate tag on the guides-overview cache, busted by any guide or topic
 * mutation. Single-sourced so the cache-side tag and the revalidation-side bust
 * can't drift.
 */
const GUIDES_TAG = "guides"

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
	{ tags: [GUIDES_TAG] }
)

/**
 * Published topics (each with its published guides) plus the ungrouped
 * remainder — guides with no topic, or whose topic is unpublished (see the
 * publish-state note at the top of this file). Scheduled guides are filtered
 * out here, at read time, so they surface the first request after their date
 * passes.
 *
 * simplified: groups the full guide set in memory rather than querying per
 * topic. Correct and cheap at tens of guides; if this grows into the hundreds,
 * split it into scoped queries before the payload size becomes the problem.
 */
export async function getGuidesOverview(): Promise<GuidesOverview> {
	const { topics, guides } = await guidesOverviewCache()
	// Built up-front from `topics` so the single guide loop can route a guide with
	// no published topic straight to `ungrouped`, rather than grouping everything
	// and then re-walking the map to rescue orphans.
	const publishedTopicIds = new Set(topics.map((topic) => topic.id))
	const byTopicId = new Map<number, GuideListItem[]>()
	const ungrouped: GuideListItem[] = []
	// Captured once so a long list can't have rows disagreeing about "now".
	const now = new Date()

	for (const { topicId, ...guide } of guides) {
		if (isScheduledGuide(guide.publishedAt, now)) {
			continue
		}

		// No topic, or a topic that didn't come back published (unpublished between
		// the guide's write and now) → ungrouped, so it stays listed somewhere
		// rather than vanishing from every listing at once.
		if (topicId == null || !publishedTopicIds.has(topicId)) {
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

	ungrouped.sort(compareGuides)

	return { topics: grouped, ungrouped }
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

/**
 * Single sources for the per-guide and per-topic detail tags, shared by the
 * `unstable_cache` wrappers below and the revalidation helpers at the bottom of
 * this file. If a wrapper and its buster ever drift, targeted busts stop
 * reaching existing entries and a stale page (or stale 404) survives every
 * per-slug revalidation — the failure class behind the 2026-07 stale-404
 * incident.
 *
 * Guides and topics share the `slug` namespace only across tables, not within
 * one — so the two tag prefixes must not overlap either. A bare `guide-${slug}`
 * for guides would make a guide slugged `topic-foo` collide with the topic
 * slugged `foo` (both `guide-topic-foo`), so busting one would silently bust the
 * other. The distinct `guide-detail-` / `guide-topic-` prefixes keep them apart.
 */
function guideTag(slug: string): string {
	return `guide-detail-${slug}`
}

function guideTopicTag(slug: string): string {
	return `guide-topic-${slug}`
}

/** Rides on every guide/topic detail wrapper; busted only by `revalidateAllGuides`. */
const GUIDE_PAGES_TAG = "guide-pages"

// One cache wrapper per slug, built lazily and reused, so each page keeps its
// own revalidation tag without paying "new wrapper per call". Bounded so 404
// probes against arbitrary slugs can't grow the map without limit — same
// pattern as `getPostBySlug` / `getProjectBySlug`.
const guideBySlugWrappers =
	createBoundedWrapperCache<() => Promise<GuideDetail>>()

export async function getGuideBySlug(
	slug: string
): Promise<GuideDetail | null> {
	const guide = await wrapNullableDetail(
		guideBySlugWrappers,
		slug,
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
		[guideTag(slug)],
		[guideTag(slug), GUIDE_PAGES_TAG]
	)

	if (guide == null) {
		return null
	}

	// Applied to the cached row rather than in the query, so a scheduled guide
	// starts resolving the first request after its date passes without waiting
	// for a cache bust — and 404s until then, so the canonical URL never serves
	// a page ahead of its date.
	return isScheduledGuide(guide.publishedAt, new Date()) ? null : guide
}

const guideTopicBySlugWrappers =
	createBoundedWrapperCache<() => Promise<GuideTopicDetail>>()

export async function getGuideTopicBySlug(
	slug: string
): Promise<GuideTopicDetail | null> {
	const topic = await wrapNullableDetail(
		guideTopicBySlugWrappers,
		slug,
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
		[guideTopicTag(slug)],
		[guideTopicTag(slug), GUIDE_PAGES_TAG]
	)

	if (topic == null) {
		return null
	}

	// The hub itself has no date to schedule against; its list still hides
	// guides whose date hasn't arrived. Read-time, same as everywhere else.
	const now = new Date()

	return {
		...topic,
		guides: topic.guides.filter(
			(guide) => !isScheduledGuide(guide.publishedAt, now)
		),
	}
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

// `findSlugOwner` lives in the Next-free `guideValidation` module so the import
// script can reuse it without dragging in `next/cache`; re-exported here to keep
// the `@/lib/db/guides` import surface whole for the admin routes.
export {
	describeGuideRefProblem,
	describeTopicRefProblem,
	findSlugOwner,
	type SlugOwner,
} from "./guideValidation"

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

/**
 * Topic list for the admin guide form's topic picker. Includes `published` so
 * the picker can flag draft topics — attaching a live guide to a draft hub is
 * allowed (the guide renders without the parent link until the hub goes live),
 * but the editor should see they're picking one that isn't live yet.
 */
export async function listGuideTopicOptions(): Promise<
	{
		id: number
		slug: string
		title: string
		projectSlug: string | null
		published: boolean
	}[]
> {
	return prisma.guideTopic.findMany({
		select: {
			id: true,
			slug: true,
			title: true,
			projectSlug: true,
			published: true,
		},
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
	revalidateTag(GUIDES_TAG, "max")
}

/** One guide's detail page plus the aggregates. Leaves sibling guide pages alone. */
export function revalidateGuide(slug: string): void {
	revalidateTag(guideTag(slug), "max")
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
	revalidateTag(guideTopicTag(slug), "max")

	for (const guideSlug of guideSlugs) {
		revalidateTag(guideTag(guideSlug), "max")
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
	revalidateTag(GUIDE_PAGES_TAG, "max")
	revalidateGuides()
}

// #endregion
