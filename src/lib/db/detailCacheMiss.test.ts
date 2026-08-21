import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/db"
import { getGuideBySlug, getGuideTopicBySlug } from "@/lib/db/guides"
import {
	getPostBySlug,
	getPostsBySection,
	getSectionPageCount,
} from "@/lib/db/posts"
import { getProjectBySlug } from "@/lib/db/projects"

// The memo factory actually stores fulfilled results per cache key, like the
// real data cache — the point of this file is asserting what gets STORED, which
// the identity-passthrough mock can't observe. Its store lives for the whole
// file, so every test uses its own slug.
vi.mock("next/cache", async () => {
	const { nextCacheMemoFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMemoFactory()
})

vi.mock("react", async (importOriginal) => {
	const { reactCachePassthroughFactory } =
		await import("@/test/mocks/nextCache")

	return reactCachePassthroughFactory(importOriginal)
})

vi.mock("@/lib/db/db", () => ({
	prisma: {
		post: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
		project: { findUnique: vi.fn() },
		guide: { findFirst: vi.fn() },
		guideTopic: { findFirst: vi.fn() },
	},
}))

beforeEach(() => {
	vi.resetAllMocks()
})

// Minimal rows: only the fields the lookup's post-query logic touches matter —
// the datetime gate for posts, `topic` destructuring for guides, the `guides`
// filter for topics, the `offers` cast for projects.
function postRow(slug: string) {
	return { id: 1, slug, section: "tech", datetime: "2024-06-01-1200" }
}

function guideRow(slug: string) {
	return { id: 1, slug, publishedAt: null, topic: null }
}

function topicRow(slug: string) {
	return { id: 1, slug, guides: [] }
}

function projectRow(slug: string) {
	return { id: 1, slug, offers: null }
}

// #region Misses are not cached

describe("detail lookups do not cache a miss", () => {
	it("getPostBySlug re-queries after a miss and finds the new row", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValueOnce(null)

		expect(await getPostBySlug("tech", "post-miss")).toBeNull()

		const row = postRow("post-miss")
		vi.mocked(prisma.post.findFirst).mockResolvedValueOnce(row as never)

		expect(await getPostBySlug("tech", "post-miss")).toEqual(row)
		expect(prisma.post.findFirst).toHaveBeenCalledTimes(2)
	})

	it("getProjectBySlug re-queries after a miss and finds the new row", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(null)

		expect(await getProjectBySlug("project-miss")).toBeNull()

		vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(
			projectRow("project-miss") as never
		)

		const found = await getProjectBySlug("project-miss")
		expect(found?.slug).toBe("project-miss")
		expect(prisma.project.findUnique).toHaveBeenCalledTimes(2)
	})

	it("getGuideBySlug re-queries after a miss and finds the new row", async () => {
		vi.mocked(prisma.guide.findFirst).mockResolvedValueOnce(null)

		expect(await getGuideBySlug("guide-miss")).toBeNull()

		vi.mocked(prisma.guide.findFirst).mockResolvedValueOnce(
			guideRow("guide-miss") as never
		)

		const found = await getGuideBySlug("guide-miss")
		expect(found?.slug).toBe("guide-miss")
		expect(prisma.guide.findFirst).toHaveBeenCalledTimes(2)
	})

	it("getGuideTopicBySlug re-queries after a miss and finds the new row", async () => {
		vi.mocked(prisma.guideTopic.findFirst).mockResolvedValueOnce(null)

		expect(await getGuideTopicBySlug("topic-miss")).toBeNull()

		vi.mocked(prisma.guideTopic.findFirst).mockResolvedValueOnce(
			topicRow("topic-miss") as never
		)

		const found = await getGuideTopicBySlug("topic-miss")
		expect(found?.slug).toBe("topic-miss")
		expect(prisma.guideTopic.findFirst).toHaveBeenCalledTimes(2)
	})
})

// #endregion

// #region Hits stay cached

// Controls for the miss tests: with the same memoizing mock, a HIT must be
// served from the store without re-querying — otherwise the miss tests would
// pass vacuously against a cache that never stores anything.

describe("detail lookups still cache a hit", () => {
	it("getPostBySlug serves a hit from cache without re-querying", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue(
			postRow("post-hit") as never
		)

		expect(await getPostBySlug("tech", "post-hit")).not.toBeNull()
		expect(await getPostBySlug("tech", "post-hit")).not.toBeNull()
		expect(prisma.post.findFirst).toHaveBeenCalledTimes(1)
	})

	it("getProjectBySlug serves a hit from cache without re-querying", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(
			projectRow("project-hit") as never
		)

		expect(await getProjectBySlug("project-hit")).not.toBeNull()
		expect(await getProjectBySlug("project-hit")).not.toBeNull()
		expect(prisma.project.findUnique).toHaveBeenCalledTimes(1)
	})

	it("getGuideBySlug serves a hit from cache without re-querying", async () => {
		vi.mocked(prisma.guide.findFirst).mockResolvedValue(
			guideRow("guide-hit") as never
		)

		expect(await getGuideBySlug("guide-hit")).not.toBeNull()
		expect(await getGuideBySlug("guide-hit")).not.toBeNull()
		expect(prisma.guide.findFirst).toHaveBeenCalledTimes(1)
	})

	it("getGuideTopicBySlug serves a hit from cache without re-querying", async () => {
		vi.mocked(prisma.guideTopic.findFirst).mockResolvedValue(
			topicRow("topic-hit") as never
		)

		expect(await getGuideTopicBySlug("topic-hit")).not.toBeNull()
		expect(await getGuideTopicBySlug("topic-hit")).not.toBeNull()
		expect(prisma.guideTopic.findFirst).toHaveBeenCalledTimes(1)
	})
})

// #endregion

// #region Real errors propagate and aren't cached

// Only the sentinel `CacheMissError` is swallowed into `null`; a genuine failure
// (DB down) must surface AND stay uncached, so the next request can succeed.
describe("detail lookups propagate a non-miss error without caching it", () => {
	it("getPostBySlug rethrows a DB error and re-queries on retry", async () => {
		vi.mocked(prisma.post.findFirst).mockRejectedValueOnce(
			new Error("db unavailable")
		)

		await expect(getPostBySlug("tech", "post-err")).rejects.toThrow(
			"db unavailable"
		)

		vi.mocked(prisma.post.findFirst).mockResolvedValueOnce(
			postRow("post-err") as never
		)

		expect(await getPostBySlug("tech", "post-err")).not.toBeNull()
		expect(prisma.post.findFirst).toHaveBeenCalledTimes(2)
	})

	it("getGuideBySlug rethrows a DB error and re-queries on retry", async () => {
		vi.mocked(prisma.guide.findFirst).mockRejectedValueOnce(
			new Error("db unavailable")
		)

		await expect(getGuideBySlug("guide-err")).rejects.toThrow("db unavailable")

		vi.mocked(prisma.guide.findFirst).mockResolvedValueOnce(
			guideRow("guide-err") as never
		)

		expect(await getGuideBySlug("guide-err")).not.toBeNull()
		expect(prisma.guide.findFirst).toHaveBeenCalledTimes(2)
	})
})

// #endregion

// #region Scheduled rows: cached, but gated to null at read time

// The scheduling gate runs on the cached row (posts by `datetime`, guides by
// `publishedAt`), NOT in the query — so a not-yet-due row IS stored, the caller
// gets null, and the day it goes live it surfaces from cache with no re-query or
// bust. This pins the "cache populated but caller gets null" seam.
describe("detail lookups gate a scheduled row to null off a warm cache", () => {
	it("getPostBySlug caches a future-dated post but returns null until due", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue({
			...postRow("post-scheduled"),
			datetime: "2999-01-01-0000",
		} as never)

		expect(await getPostBySlug("tech", "post-scheduled")).toBeNull()
		expect(await getPostBySlug("tech", "post-scheduled")).toBeNull()
		// One query: the row is cached even though every read so far gates to null.
		expect(prisma.post.findFirst).toHaveBeenCalledTimes(1)
	})

	it("getGuideBySlug caches a future-published guide but returns null until due", async () => {
		vi.mocked(prisma.guide.findFirst).mockResolvedValue({
			...guideRow("guide-scheduled"),
			publishedAt: new Date("2999-01-01T00:00:00.000Z"),
		} as never)

		expect(await getGuideBySlug("guide-scheduled")).toBeNull()
		expect(await getGuideBySlug("guide-scheduled")).toBeNull()
		expect(prisma.guide.findFirst).toHaveBeenCalledTimes(1)
	})
})

// #endregion

// #region Blog pagination shares one count cache entry

// The behaviour 070f6bf changed: getPostsBySection's totalPages used to run
// its own independent `count()`, the same query getSectionPageCount also ran
// under the same tag but as a separate cache entry that could regenerate on
// its own schedule — the split that let Pagination and isRealPage disagree
// about where a section ends. Every other test file mocks `prisma.post.count`
// directly, which can't tell a shared cache entry from two independent ones
// that just happen to return the same mocked value. This one can, because the
// memo mock actually stores by cache key instead of passing calls through.
describe("getPostsBySection delegates its count to getSectionPageCount's cache entry", () => {
	it("does not re-count when the section's page count is already cached", async () => {
		vi.mocked(prisma.post.count).mockResolvedValue(25)
		vi.mocked(prisma.post.findMany).mockResolvedValue([])

		const directCount = await getSectionPageCount("tech")
		const { totalPages } = await getPostsBySection("tech", 1)

		expect(directCount).toBe(3) // ceil(25 / PAGE_SIZE 10)
		expect(totalPages).toBe(3)
		// The load-bearing assertion: if getPostsBySection ran its own count()
		// instead of reading getSectionPageCount's cache entry, this would be 2.
		expect(prisma.post.count).toHaveBeenCalledTimes(1)
	})

	it("populates the shared entry from the list-page path too, not just the direct path", async () => {
		// The other direction: warm the cache via getPostsBySection first, then
		// confirm getSectionPageCount (as the p/[page] route's isRealPage calls
		// it) reads the same entry rather than counting again.
		vi.mocked(prisma.post.count).mockResolvedValue(15)
		vi.mocked(prisma.post.findMany).mockResolvedValue([])

		const { totalPages } = await getPostsBySection("life", 1)
		const laterCount = await getSectionPageCount("life")

		expect(totalPages).toBe(2) // ceil(15 / PAGE_SIZE 10)
		expect(laterCount).toBe(2)
		expect(prisma.post.count).toHaveBeenCalledTimes(1)
	})
})

// #endregion
