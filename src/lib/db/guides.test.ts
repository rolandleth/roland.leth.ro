import { revalidateTag, unstable_cache } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/db"
import {
	allGuides,
	findSlugOwner,
	getGuideBySlug,
	getGuideTopicBySlug,
	getGuidesForProject,
	getGuidesOverview,
	listGuideTopicsForAdmin,
	listGuidesForAdmin,
	revalidateAllGuides,
	revalidateGuide,
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
})

// #endregion

// #region findSlugOwner

describe("findSlugOwner", () => {
	function mockOwners(guide: number | null, topic: number | null) {
		vi.mocked(prisma.guide.findUnique).mockResolvedValue(
			guide == null ? null : ({ id: guide } as never)
		)
		vi.mocked(prisma.guideTopic.findUnique).mockResolvedValue(
			topic == null ? null : ({ id: topic } as never)
		)
	}

	it("returns null when the slug is free in both tables", async () => {
		mockOwners(null, null)

		expect(await findSlugOwner("free")).toBeNull()
	})

	it("reports a guide holding the slug", async () => {
		mockOwners(1, null)

		expect(await findSlugOwner("taken")).toBe("guide")
	})

	it("reports a topic holding the slug", async () => {
		mockOwners(null, 2)

		expect(await findSlugOwner("taken")).toBe("topic")
	})

	it("ignores the guide being updated so re-saving its own slug is free", async () => {
		mockOwners(1, null)

		expect(await findSlugOwner("taken", { kind: "guide", id: 1 })).toBeNull()
	})

	it("ignores the topic being updated so re-saving its own slug is free", async () => {
		mockOwners(null, 2)

		expect(await findSlugOwner("taken", { kind: "topic", id: 2 })).toBeNull()
	})

	it("still reports a conflict when a different guide holds the slug", async () => {
		mockOwners(1, null)

		expect(await findSlugOwner("taken", { kind: "guide", id: 99 })).toBe(
			"guide"
		)
	})

	// The cross-table case the DB can't express: a topic can't take a guide's
	// slug just because it's a different table.
	it("reports the topic when a guide update collides with a topic's slug", async () => {
		mockOwners(null, 2)

		expect(await findSlugOwner("taken", { kind: "guide", id: 1 })).toBe("topic")
	})
})

// #endregion

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
			"guide-how-to-keep-a-decision-journal",
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
		expect(revalidateTag).toHaveBeenCalledWith("guide-guide-a", "max")
		expect(revalidateTag).toHaveBeenCalledWith("guide-guide-b", "max")
		expect(revalidateTag).toHaveBeenCalledWith("guides", "max")
	})

	it("handles a topic with no guides", () => {
		revalidateGuideTopic("empty-topic")

		expect(revalidateTag).toHaveBeenCalledWith("guide-topic-empty-topic", "max")
		expect(revalidateTag).toHaveBeenCalledWith("guides", "max")
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
