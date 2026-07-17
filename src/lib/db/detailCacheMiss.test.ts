import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/db"
import { getGuideBySlug, getGuideTopicBySlug } from "@/lib/db/guides"
import { getPostBySlug } from "@/lib/db/posts"
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
		post: { findFirst: vi.fn() },
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
