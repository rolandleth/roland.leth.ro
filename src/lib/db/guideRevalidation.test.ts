import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/db"
import { revalidateTopicsById } from "@/lib/db/guideRevalidation"
import { revalidateGuideTopic } from "@/lib/db/guides"

vi.mock("@/lib/db/db", () => ({
	prisma: { guideTopic: { findMany: vi.fn() } },
}))

vi.mock("@/lib/db/guides", () => ({ revalidateGuideTopic: vi.fn() }))

beforeEach(() => {
	vi.resetAllMocks()
})

describe("revalidateTopicsById", () => {
	it("busts the hub of each named topic", async () => {
		vi.mocked(prisma.guideTopic.findMany).mockResolvedValue([
			{ slug: "topic-a" },
			{ slug: "topic-b" },
		] as never)

		await revalidateTopicsById([1, 2])

		expect(revalidateGuideTopic).toHaveBeenCalledWith("topic-a")
		expect(revalidateGuideTopic).toHaveBeenCalledWith("topic-b")
	})

	// Callers pass `[previousTopicId, nextTopicId]` without pre-filtering.
	it("drops nulls", async () => {
		vi.mocked(prisma.guideTopic.findMany).mockResolvedValue([
			{ slug: "topic-a" },
		] as never)

		await revalidateTopicsById([null, 1])

		expect(
			vi.mocked(prisma.guideTopic.findMany).mock.calls[0][0]
		).toMatchObject({ where: { id: { in: [1] } } })
	})

	it("dedupes a guide edited within one topic", async () => {
		vi.mocked(prisma.guideTopic.findMany).mockResolvedValue([
			{ slug: "topic-a" },
		] as never)

		await revalidateTopicsById([7, 7])

		expect(
			vi.mocked(prisma.guideTopic.findMany).mock.calls[0][0]
		).toMatchObject({ where: { id: { in: [7] } } })
	})

	it("skips the query entirely for an ungrouped guide", async () => {
		await revalidateTopicsById([null, null])

		expect(prisma.guideTopic.findMany).not.toHaveBeenCalled()
		expect(revalidateGuideTopic).not.toHaveBeenCalled()
	})

	it("skips the query for an empty list", async () => {
		await revalidateTopicsById([])

		expect(prisma.guideTopic.findMany).not.toHaveBeenCalled()
	})
})
