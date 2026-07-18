import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/db"
import {
	revalidateGuideSlugs,
	revalidateTopicsById,
} from "@/lib/db/guideRevalidation"
import { revalidateGuide, revalidateGuideTopic } from "@/lib/db/guides"

vi.mock("@/lib/db/db", () => ({
	prisma: {
		guideTopic: { findMany: vi.fn() },
		guide: { findMany: vi.fn() },
	},
}))

vi.mock("@/lib/db/guides", () => ({
	revalidateGuide: vi.fn(),
	revalidateGuideTopic: vi.fn(),
}))

beforeEach(() => {
	vi.resetAllMocks()
})

describe("revalidateTopicsById", () => {
	it("busts the hub of each named topic and returns the count", async () => {
		vi.mocked(prisma.guideTopic.findMany).mockResolvedValue([
			{ slug: "topic-a" },
			{ slug: "topic-b" },
		] as never)

		const busted = await revalidateTopicsById([1, 2])

		expect(revalidateGuideTopic).toHaveBeenCalledWith("topic-a")
		expect(revalidateGuideTopic).toHaveBeenCalledWith("topic-b")
		expect(busted).toBe(2)
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
		const busted = await revalidateTopicsById([null, null])

		expect(prisma.guideTopic.findMany).not.toHaveBeenCalled()
		expect(revalidateGuideTopic).not.toHaveBeenCalled()
		expect(busted).toBe(0)
	})

	it("skips the query for an empty list", async () => {
		await revalidateTopicsById([])

		expect(prisma.guideTopic.findMany).not.toHaveBeenCalled()
	})

	// A stale topic reference (a hub deleted between the caller's read and this
	// bust) must not silently bust fewer hubs than asked.
	it("warns when a requested id resolves to no hub", async () => {
		vi.mocked(prisma.guideTopic.findMany).mockResolvedValue([
			{ slug: "topic-a" },
		] as never)
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

		const busted = await revalidateTopicsById([1, 2])

		expect(busted).toBe(1)
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("did not resolve"),
			{ requested: 2, resolved: 1 }
		)

		warn.mockRestore()
	})
})

describe("revalidateGuideSlugs", () => {
	it("busts each slug as both a guide and a topic tag", async () => {
		vi.mocked(prisma.guide.findMany).mockResolvedValue([] as never)

		await revalidateGuideSlugs(["decision-journal", "making-better-decisions"])

		expect(revalidateGuide).toHaveBeenCalledWith("decision-journal")
		expect(revalidateGuideTopic).toHaveBeenCalledWith("decision-journal")
		expect(revalidateGuide).toHaveBeenCalledWith("making-better-decisions")
		expect(revalidateGuideTopic).toHaveBeenCalledWith("making-better-decisions")
	})

	// A guide's parent hub lists its title/summary, so a script edit to the guide
	// leaves the hub stale unless its tag is busted too.
	it("resolves the parent topic hub of any slug that is a guide", async () => {
		vi.mocked(prisma.guide.findMany).mockResolvedValue([
			{ slug: "decision-journal", topicId: 7 },
		] as never)
		vi.mocked(prisma.guideTopic.findMany).mockResolvedValue([
			{ slug: "making-better-decisions" },
		] as never)

		const matched = await revalidateGuideSlugs(["decision-journal"])

		expect(
			vi.mocked(prisma.guideTopic.findMany).mock.calls[0][0]
		).toMatchObject({ where: { id: { in: [7] } } })
		expect(revalidateGuideTopic).toHaveBeenCalledWith("making-better-decisions")
		expect(matched).toEqual(["decision-journal"])
	})

	it("resolves no parent for a slug that matches no guide row", async () => {
		vi.mocked(prisma.guide.findMany).mockResolvedValue([] as never)

		const matched = await revalidateGuideSlugs(["making-better-decisions"])

		// No guide matched, so no parent-hub lookup runs.
		expect(prisma.guideTopic.findMany).not.toHaveBeenCalled()
		expect(matched).toEqual([])
	})
})
