import { revalidateTag, unstable_cache } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/db"
import {
	allGuides,
	findGuidesBecameLive,
	getGuideBySlug,
	getGuideTopicBySlug,
	getGuidesForProject,
	getGuidesOverview,
	listGuideTopicsForAdmin,
	listGuidesForAdmin,
	revalidateAllGuides,
	revalidateGuide,
	revalidateGuideDetails,
	revalidateGuideTopic,
	revalidateGuides,
	type GuideListItem,
} from "@/lib/db/guides"
import { PAGE_SIZE } from "@/lib/utils/pagination"
import { makeGuideListItem, makeGuideTopicSummary } from "@/test/fixtures"

vi.mock("next/cache", async () => {
	const { nextCacheSpyFactory } = await import("@/test/mocks/nextCache")

	return nextCacheSpyFactory()
})

// Snapshot every `unstable_cache(...)` registration from guides.ts at
// module-load time, before `beforeEach`'s `vi.resetAllMocks()` wipes the spy's
// history. Pins the aggregate to a single cache entry on a single tag — the
// property the whole invalidation story rests on. Per-slug detail wrappers are
// built lazily and so are deliberately absent here.
const cacheWrapsAtLoad = vi.mocked(unstable_cache).mock.calls.map((call) => ({
	keys: call[1],
	tags: (call[2] as { tags?: string[] } | undefined)?.tags,
}))

vi.mock("react", async (importOriginal) => {
	const { reactCachePassthroughFactory } =
		await import("@/test/mocks/nextCache")

	return reactCachePassthroughFactory(importOriginal)
})

vi.mock("@/lib/db/db", () => ({
	prisma: {
		guide: {
			findMany: vi.fn(),
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			count: vi.fn(),
		},
		guideTopic: {
			findMany: vi.fn(),
			findFirst: vi.fn(),
			findUnique: vi.fn(),
		},
	},
}))

beforeEach(() => {
	vi.resetAllMocks()
})

/** An overview-query row: a list item plus the `topicId` the grouping reads. */
function makeOverviewGuide(
	overrides: Partial<GuideListItem> & { topicId?: number | null } = {}
) {
	const { topicId = null, ...rest } = overrides

	return { ...makeGuideListItem(rest), topicId }
}

function mockOverview(
	topics: unknown[],
	guides: ReturnType<typeof makeOverviewGuide>[]
) {
	vi.mocked(prisma.guideTopic.findMany).mockResolvedValue(
		topics as never as never[]
	)
	vi.mocked(prisma.guide.findMany).mockResolvedValue(guides as never as never[])
}

// #region getGuidesOverview

describe("getGuidesOverview", () => {
	it("groups published guides under their topic", async () => {
		mockOverview(
			[makeGuideTopicSummary({ id: 7 })],
			[
				makeOverviewGuide({ id: 1, slug: "first", topicId: 7 }),
				makeOverviewGuide({ id: 2, slug: "second", topicId: 7 }),
			]
		)

		const { topics, ungrouped } = await getGuidesOverview()

		expect(topics).toHaveLength(1)
		expect(topics[0].guides.map((guide) => guide.slug)).toEqual([
			"first",
			"second",
		])
		expect(ungrouped).toEqual([])
	})

	it("drops the internal topicId from the returned guides", async () => {
		mockOverview([], [makeOverviewGuide({ topicId: null })])

		const { ungrouped } = await getGuidesOverview()

		expect(ungrouped[0]).not.toHaveProperty("topicId")
	})

	it("lists guides with no topic as ungrouped", async () => {
		mockOverview([], [makeOverviewGuide({ slug: "standalone", topicId: null })])

		const { topics, ungrouped } = await getGuidesOverview()

		expect(topics).toEqual([])
		expect(ungrouped.map((guide) => guide.slug)).toEqual(["standalone"])
	})

	it("returns an empty guide list for a topic that has none", async () => {
		mockOverview([makeGuideTopicSummary({ id: 7 })], [])

		const { topics } = await getGuidesOverview()

		expect(topics[0].guides).toEqual([])
	})

	// The load-bearing publish-state rule: unpublishing a hub dissolves the
	// grouping but must never deindex the live guides underneath it.
	it("falls guides of an unpublished topic back to ungrouped rather than dropping them", async () => {
		mockOverview([], [makeOverviewGuide({ slug: "orphaned", topicId: 99 })])

		const { topics, ungrouped } = await getGuidesOverview()

		expect(topics).toEqual([])
		expect(ungrouped.map((guide) => guide.slug)).toEqual(["orphaned"])
	})

	it("re-sorts the ungrouped list by sortOrder then title after regrouping", async () => {
		mockOverview(
			[],
			[
				makeOverviewGuide({ slug: "b-second", title: "B", sortOrder: 2 }),
				makeOverviewGuide({
					slug: "from-dead-topic",
					title: "A",
					sortOrder: 1,
					topicId: 99,
				}),
				makeOverviewGuide({ slug: "a-first", title: "A", sortOrder: 0 }),
			]
		)

		const { ungrouped } = await getGuidesOverview()

		expect(ungrouped.map((guide) => guide.slug)).toEqual([
			"a-first",
			"from-dead-topic",
			"b-second",
		])
	})

	it("breaks a sortOrder tie by title", async () => {
		mockOverview(
			[],
			[
				makeOverviewGuide({ slug: "zebra", title: "Zebra", sortOrder: 0 }),
				makeOverviewGuide({
					slug: "apple",
					title: "Apple",
					sortOrder: 0,
					topicId: 99,
				}),
			]
		)

		const { ungrouped } = await getGuidesOverview()

		expect(ungrouped.map((guide) => guide.slug)).toEqual(["apple", "zebra"])
	})

	it("queries only published topics and guides", async () => {
		mockOverview([], [])

		await getGuidesOverview()

		expect(
			vi.mocked(prisma.guideTopic.findMany).mock.calls[0][0]
		).toMatchObject({ where: { published: true } })
		expect(vi.mocked(prisma.guide.findMany).mock.calls[0][0]).toMatchObject({
			where: { published: true },
		})
	})
})

// #endregion

// #region getGuidesOverview — scheduling

describe("getGuidesOverview — scheduling", () => {
	const FUTURE = new Date("2999-01-01T00:00:00.000Z")

	it("hides a guide whose publish date hasn't arrived", async () => {
		mockOverview(
			[],
			[
				makeOverviewGuide({ slug: "live" }),
				makeOverviewGuide({ slug: "scheduled", publishedAt: FUTURE }),
			]
		)

		const { ungrouped } = await getGuidesOverview()

		expect(ungrouped.map((guide) => guide.slug)).toEqual(["live"])
	})

	it("hides a scheduled guide from its topic's list", async () => {
		mockOverview(
			[makeGuideTopicSummary({ id: 7 })],
			[
				makeOverviewGuide({ slug: "live", topicId: 7 }),
				makeOverviewGuide({
					slug: "scheduled",
					topicId: 7,
					publishedAt: FUTURE,
				}),
			]
		)

		const { topics } = await getGuidesOverview()

		expect(topics[0].guides.map((guide) => guide.slug)).toEqual(["live"])
	})

	it("shows a guide with no publish date rather than hiding it", async () => {
		mockOverview(
			[],
			[makeOverviewGuide({ slug: "dateless", publishedAt: null })]
		)

		const { ungrouped } = await getGuidesOverview()

		expect(ungrouped.map((guide) => guide.slug)).toEqual(["dateless"])
	})

	// The load-bearing bit: the query must NOT filter on the date. The cache
	// holds scheduled rows so they surface on the first request after their date
	// passes — no cron, no manual revalidate. Filtering in the query (or
	// capturing `now` inside the cached fn) would strand them until a bust.
	it("keeps scheduled rows in the query so they can auto-surface later", async () => {
		mockOverview([], [])

		await getGuidesOverview()

		const call = vi.mocked(prisma.guide.findMany).mock.calls[0][0] as {
			where: Record<string, unknown>
		}

		expect(call.where.published).toBe(true)
		expect(call.where).not.toHaveProperty("publishedAt")
	})
})

// #endregion

// #region allGuides

describe("allGuides", () => {
	it("returns every published guide, grouped and ungrouped", async () => {
		mockOverview(
			[makeGuideTopicSummary({ id: 7 })],
			[
				makeOverviewGuide({ slug: "in-topic", topicId: 7 }),
				makeOverviewGuide({ slug: "standalone", topicId: null }),
			]
		)

		const overview = await getGuidesOverview()

		expect(allGuides(overview).map((guide) => guide.slug)).toEqual([
			"in-topic",
			"standalone",
		])
	})

	it("returns an empty list when there are no guides", () => {
		expect(allGuides({ topics: [], ungrouped: [] })).toEqual([])
	})
})

// #endregion

// #region getGuidesForProject

describe("getGuidesForProject", () => {
	it("keeps only the topics and ungrouped guides belonging to the project", async () => {
		mockOverview(
			[
				makeGuideTopicSummary({ id: 7, slug: "mine", projectSlug: "reckon" }),
				makeGuideTopicSummary({
					id: 8,
					slug: "theirs",
					projectSlug: "continuum",
				}),
			],
			[
				makeOverviewGuide({ slug: "mine-standalone", projectSlug: "reckon" }),
				makeOverviewGuide({
					slug: "theirs-standalone",
					projectSlug: "continuum",
				}),
			]
		)

		const { topics, ungrouped } = await getGuidesForProject("reckon")

		expect(topics.map((topic) => topic.slug)).toEqual(["mine"])
		expect(ungrouped.map((guide) => guide.slug)).toEqual(["mine-standalone"])
	})

	it("excludes guides with no project", async () => {
		mockOverview(
			[],
			[makeOverviewGuide({ slug: "no-product", projectSlug: null })]
		)

		const { ungrouped } = await getGuidesForProject("reckon")

		expect(ungrouped).toEqual([])
	})
})

// #endregion

// #region getGuideBySlug

describe("getGuideBySlug", () => {
	it("enforces `published: true` at the query boundary", async () => {
		vi.mocked(prisma.guide.findFirst).mockResolvedValue(null)

		await getGuideBySlug("some-guide")

		expect(vi.mocked(prisma.guide.findFirst).mock.calls[0][0]).toMatchObject({
			where: { slug: "some-guide", published: true },
		})
	})

	it("returns null when there is no matching published guide", async () => {
		vi.mocked(prisma.guide.findFirst).mockResolvedValue(null)

		expect(await getGuideBySlug("missing")).toBeNull()
	})

	// The page render and the JSON-LD builder read these off the detail row; a
	// dropped SELECT column would surface only at runtime, so pin it here.
	it("selects the fields the detail page and JSON-LD builder need", async () => {
		vi.mocked(prisma.guide.findFirst).mockResolvedValue(null)

		await getGuideBySlug("some-guide")

		expect(vi.mocked(prisma.guide.findFirst).mock.calls[0][0]).toMatchObject({
			select: {
				title: true,
				slug: true,
				description: true,
				body: true,
				readingTime: true,
				publishedAt: true,
				updatedAt: true,
			},
		})
	})

	it("carries the parent topic when the hub is published", async () => {
		vi.mocked(prisma.guide.findFirst).mockResolvedValue({
			...makeGuideListItem({ slug: "with-topic" }),
			body: "Body.",
			publishedAt: new Date("2026-07-01T00:00:00.000Z"),
			topic: {
				slug: "making-better-decisions",
				title: "Making better decisions",
				published: true,
			},
		} as never)

		const guide = await getGuideBySlug("with-topic")

		expect(guide?.topic).toEqual({
			slug: "making-better-decisions",
			title: "Making better decisions",
		})
	})

	// Rendering the link anyway would point a live page at a 404 hub.
	it("drops the parent link when the hub is unpublished", async () => {
		vi.mocked(prisma.guide.findFirst).mockResolvedValue({
			...makeGuideListItem({ slug: "hidden-topic" }),
			body: "Body.",
			publishedAt: null,
			topic: { slug: "staged", title: "Staged", published: false },
		} as never)

		const guide = await getGuideBySlug("hidden-topic")

		expect(guide?.topic).toBeNull()
	})

	it("reports no topic for an ungrouped guide", async () => {
		vi.mocked(prisma.guide.findFirst).mockResolvedValue({
			...makeGuideListItem({ slug: "standalone" }),
			body: "Body.",
			publishedAt: null,
			topic: null,
		} as never)

		const guide = await getGuideBySlug("standalone")

		expect(guide?.topic).toBeNull()
	})

	// The canonical URL must never serve a page ahead of its date.
	it("returns null for a guide whose publish date hasn't arrived", async () => {
		vi.mocked(prisma.guide.findFirst).mockResolvedValue({
			...makeGuideListItem({ slug: "scheduled" }),
			body: "Body.",
			publishedAt: new Date("2999-01-01T00:00:00.000Z"),
			topic: null,
		} as never)

		expect(await getGuideBySlug("scheduled")).toBeNull()
	})

	it("serves a guide whose publish date has passed", async () => {
		vi.mocked(prisma.guide.findFirst).mockResolvedValue({
			...makeGuideListItem({ slug: "live" }),
			body: "Body.",
			publishedAt: new Date("2020-01-01T00:00:00.000Z"),
			topic: null,
		} as never)

		expect(await getGuideBySlug("live")).not.toBeNull()
	})

	// Read-time, not in the query: the cache holds the row so it starts
	// resolving the first request after its date passes, with no bust.
	it("does not filter on the date in the query", async () => {
		vi.mocked(prisma.guide.findFirst).mockResolvedValue(null)

		await getGuideBySlug("some-guide")

		const call = vi.mocked(prisma.guide.findFirst).mock.calls[0][0] as {
			where: Record<string, unknown>
		}

		expect(call.where).not.toHaveProperty("publishedAt")
	})

	it("never leaks the topic's publish flag to callers", async () => {
		vi.mocked(prisma.guide.findFirst).mockResolvedValue({
			...makeGuideListItem({ slug: "with-topic" }),
			body: "Body.",
			publishedAt: null,
			topic: { slug: "t", title: "T", published: true },
		} as never)

		const guide = await getGuideBySlug("with-topic")

		expect(guide?.topic).not.toHaveProperty("published")
	})
})

// #endregion

// #region getGuideTopicBySlug

describe("getGuideTopicBySlug", () => {
	it("enforces `published: true` and returns only published guides, in order", async () => {
		vi.mocked(prisma.guideTopic.findFirst).mockResolvedValue(null)

		await getGuideTopicBySlug("making-better-decisions")

		expect(
			vi.mocked(prisma.guideTopic.findFirst).mock.calls[0][0]
		).toMatchObject({
			where: { slug: "making-better-decisions", published: true },
			select: {
				guides: {
					where: { published: true },
					orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
				},
			},
		})
	})

	it("returns null when there is no matching published topic", async () => {
		vi.mocked(prisma.guideTopic.findFirst).mockResolvedValue(null)

		expect(await getGuideTopicBySlug("missing")).toBeNull()
	})

	// A hub has no date of its own, but its list still hides pending guides.
	it("hides a scheduled guide from the hub's list", async () => {
		vi.mocked(prisma.guideTopic.findFirst).mockResolvedValue({
			...makeGuideTopicSummary(),
			description: "Hub body.",
			guides: [
				makeGuideListItem({ slug: "live" }),
				makeGuideListItem({
					slug: "scheduled",
					publishedAt: new Date("2999-01-01T00:00:00.000Z"),
				}),
			],
		} as never)

		const topic = await getGuideTopicBySlug("making-better-decisions")

		expect(topic?.guides.map((guide) => guide.slug)).toEqual(["live"])
	})

	it("serves the hub itself regardless of its guides' dates", async () => {
		vi.mocked(prisma.guideTopic.findFirst).mockResolvedValue({
			...makeGuideTopicSummary(),
			description: "Hub body.",
			guides: [
				makeGuideListItem({
					slug: "scheduled",
					publishedAt: new Date("2999-01-01T00:00:00.000Z"),
				}),
			],
		} as never)

		const topic = await getGuideTopicBySlug("making-better-decisions")

		expect(topic).not.toBeNull()
		expect(topic?.guides).toEqual([])
	})
})

// #endregion

// `findSlugOwner` is re-exported from here but implemented (and tested) in
// `guideValidation.ts`, which is Next-free so the import script can share it.

// #region listGuidesForAdmin

describe("listGuidesForAdmin", () => {
	it("returns every guide unfiltered when no query is given", async () => {
		vi.mocked(prisma.guide.findMany).mockResolvedValue([])
		vi.mocked(prisma.guide.count).mockResolvedValue(0)

		await listGuidesForAdmin({ page: 1 })

		expect(vi.mocked(prisma.guide.findMany).mock.calls[0][0]).toMatchObject({
			where: {},
		})
	})

	it("matches title or body case-insensitively when searching", async () => {
		vi.mocked(prisma.guide.findMany).mockResolvedValue([])
		vi.mocked(prisma.guide.count).mockResolvedValue(0)

		await listGuidesForAdmin({ query: "journal", page: 1 })

		expect(vi.mocked(prisma.guide.findMany).mock.calls[0][0]).toMatchObject({
			where: {
				OR: [
					{ title: { contains: "journal", mode: "insensitive" } },
					{ body: { contains: "journal", mode: "insensitive" } },
				],
			},
		})
	})

	it("treats a whitespace-only query as no query", async () => {
		vi.mocked(prisma.guide.findMany).mockResolvedValue([])
		vi.mocked(prisma.guide.count).mockResolvedValue(0)

		await listGuidesForAdmin({ query: "   ", page: 1 })

		expect(vi.mocked(prisma.guide.findMany).mock.calls[0][0]).toMatchObject({
			where: {},
		})
	})

	it("skips a full page per page number", async () => {
		vi.mocked(prisma.guide.findMany).mockResolvedValue([])
		vi.mocked(prisma.guide.count).mockResolvedValue(0)

		await listGuidesForAdmin({ page: 3 })

		expect(vi.mocked(prisma.guide.findMany).mock.calls[0][0]).toMatchObject({
			skip: PAGE_SIZE * 2,
			take: PAGE_SIZE,
		})
	})

	it("computes totalPages from the unpaginated count", async () => {
		vi.mocked(prisma.guide.findMany).mockResolvedValue([])
		vi.mocked(prisma.guide.count).mockResolvedValue(PAGE_SIZE * 2 + 1)

		const { totalPages } = await listGuidesForAdmin({ page: 1 })

		expect(totalPages).toBe(3)
	})
})

// #endregion

// #region listGuideTopicsForAdmin

describe("listGuideTopicsForAdmin", () => {
	it("flattens the relation count into `guideCount`", async () => {
		vi.mocked(prisma.guideTopic.findMany).mockResolvedValue([
			{
				...makeGuideTopicSummary(),
				published: true,
				_count: { guides: 3 },
			},
		] as never)

		const topics = await listGuideTopicsForAdmin()

		expect(topics[0].guideCount).toBe(3)
		expect(topics[0]).not.toHaveProperty("_count")
	})
})

// #endregion

// #region revalidation

describe("revalidateGuides", () => {
	it("busts the shared aggregate tag", () => {
		revalidateGuides()

		expect(revalidateTag).toHaveBeenCalledWith("guides", "max")
	})
})

describe("revalidateGuide", () => {
	it("busts the guide's own page plus the aggregates", () => {
		revalidateGuide("how-to-keep-a-decision-journal")

		expect(revalidateTag).toHaveBeenCalledWith(
			"guide-detail-how-to-keep-a-decision-journal",
			"max"
		)
		expect(revalidateTag).toHaveBeenCalledWith("guides", "max")
	})

	it("leaves sibling guide pages alone", () => {
		revalidateGuide("one-guide")

		expect(revalidateTag).not.toHaveBeenCalledWith("guide-pages", "max")
	})
})

describe("revalidateGuideTopic", () => {
	// Each guide renders the parent link, which appears/disappears with the
	// topic's publish state — so they can't be left stale.
	it("busts the hub, every guide in it, and the aggregates", () => {
		revalidateGuideTopic("making-better-decisions", ["guide-a", "guide-b"])

		expect(revalidateTag).toHaveBeenCalledWith(
			"guide-topic-making-better-decisions",
			"max"
		)
		expect(revalidateTag).toHaveBeenCalledWith("guide-detail-guide-a", "max")
		expect(revalidateTag).toHaveBeenCalledWith("guide-detail-guide-b", "max")
		expect(revalidateTag).toHaveBeenCalledWith("guides", "max")
	})

	it("handles a topic with no guides", () => {
		revalidateGuideTopic("empty-topic")

		expect(revalidateTag).toHaveBeenCalledWith("guide-topic-empty-topic", "max")
		expect(revalidateTag).toHaveBeenCalledWith("guides", "max")
	})
})

describe("guide vs topic tag namespaces", () => {
	// Regression guard: guide and topic slugs share a namespace across tables but
	// their cache tags must not. A guide slugged `topic-foo` and a topic slugged
	// `foo` must bust different tags — with a bare `guide-${slug}` guide tag both
	// would be `guide-topic-foo` and one bust would silently clobber the other.
	it("keeps a guide slugged 'topic-foo' distinct from a topic slugged 'foo'", () => {
		revalidateGuide("topic-foo")
		const guideDetailTag = vi
			.mocked(revalidateTag)
			.mock.calls.map((call) => call[0])
			.find((tag) => tag !== "guides")

		vi.mocked(revalidateTag).mockClear()

		revalidateGuideTopic("foo")
		const topicDetailTag = vi
			.mocked(revalidateTag)
			.mock.calls.map((call) => call[0])
			.find((tag) => tag !== "guides")

		expect(guideDetailTag).toBe("guide-detail-topic-foo")
		expect(topicDetailTag).toBe("guide-topic-foo")
		expect(guideDetailTag).not.toBe(topicDetailTag)
	})
})

describe("revalidateAllGuides", () => {
	it("busts every detail page plus the aggregates", () => {
		revalidateAllGuides()

		expect(revalidateTag).toHaveBeenCalledWith("guide-pages", "max")
		expect(revalidateTag).toHaveBeenCalledWith("guides", "max")
	})
})

// #endregion

// #region cache wiring

describe("module-load cache registrations", () => {
	// Pins the aggregate to exactly one entry on exactly one tag. A second
	// module-load wrap (or a lost tag) drifts this and fails — the invalidation
	// story assumes `guides` is the only aggregate tag to bust.
	it("registers only the overview aggregate, tagged `guides`", () => {
		expect(cacheWrapsAtLoad).toEqual([
			{ keys: ["guides-overview"], tags: ["guides"] },
		])
	})
})

// #endregion

// #region findGuidesBecameLive

describe("findGuidesBecameLive", () => {
	const windowStart = new Date("2026-08-15T08:00:00Z")
	const now = new Date("2026-08-15T10:00:00Z")

	it("returns the slugs of published guides inside the window", async () => {
		vi.mocked(prisma.guide.findMany).mockResolvedValue([
			{ slug: "one" },
			{ slug: "two" },
		] as never)

		const result = await findGuidesBecameLive(windowStart, now, 50)

		expect(result).toEqual(["one", "two"])
		expect(prisma.guide.findMany).toHaveBeenCalledWith({
			where: {
				published: true,
				publishedAt: { gt: windowStart, lte: now },
			},
			select: { slug: true },
			take: 50,
		})
	})

	it("bounds the result with the caller's limit", async () => {
		// Same contract as the post side: the caller asks for one row past what it
		// will process individually, and switches to a blanket bust on overflow.
		vi.mocked(prisma.guide.findMany).mockResolvedValue([] as never)

		await findGuidesBecameLive(windowStart, now, 7)

		expect(vi.mocked(prisma.guide.findMany).mock.calls[0][0]?.take).toBe(7)
	})

	it("excludes the lower bound and includes the upper", async () => {
		// Half-open, matching `findPostsBecameLive`: consecutive cron runs
		// share a boundary instant, and an inclusive lower bound would re-report
		// the same guide every run and bust the caches on every pass.
		vi.mocked(prisma.guide.findMany).mockResolvedValue([] as never)

		await findGuidesBecameLive(windowStart, now, 50)

		const where = vi.mocked(prisma.guide.findMany).mock.calls[0][0]?.where

		expect(where?.publishedAt).toEqual({ gt: windowStart, lte: now })
	})

	it("cannot match a guide with a null publishedAt", async () => {
		// A null `publishedAt` means never scheduled, so it must never come
		// due. Prisma's range filter excludes nulls, which this pins.
		vi.mocked(prisma.guide.findMany).mockResolvedValue([] as never)

		await findGuidesBecameLive(windowStart, now, 50)

		const where = vi.mocked(prisma.guide.findMany).mock.calls[0][0]?.where

		expect(where?.publishedAt).not.toBeNull()
		expect(where?.publishedAt).toHaveProperty("gt")
	})
})

// #endregion

// #region revalidateGuideDetails

describe("revalidateGuideDetails", () => {
	it("busts each due guide's own detail tag and nothing else", async () => {
		// `revalidateGuides` covers the aggregates. This reaches the prerendered
		// `/guides/:slug` entries, which can be holding a 404 rendered while the
		// guide was still scheduled.
		const { revalidateTag } = await import("next/cache")

		vi.mocked(revalidateTag).mockClear()

		revalidateGuideDetails(["one", "two"])

		expect(vi.mocked(revalidateTag).mock.calls.map((call) => call[0])).toEqual([
			"guide-detail-one",
			"guide-detail-two",
		])
	})

	it("does nothing for an empty list", async () => {
		const { revalidateTag } = await import("next/cache")

		vi.mocked(revalidateTag).mockClear()

		revalidateGuideDetails([])

		expect(revalidateTag).not.toHaveBeenCalled()
	})
})

// #endregion
