import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { lookupLegacySlug } from "@/lib/legacySlug"

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db", () => ({
	prisma: {
		post: { findFirst: vi.fn() },
		project: { findFirst: vi.fn() },
	},
}))

beforeEach(() => {
	vi.clearAllMocks()
	vi.mocked(prisma.post.findFirst).mockResolvedValue(null)
	vi.mocked(prisma.project.findFirst).mockResolvedValue(null)
})

describe("lookupLegacySlug", () => {
	it("returns null when neither table matches", async () => {
		expect(await lookupLegacySlug("missing")).toBeNull()
	})

	it("returns a post match with section and slug when a post exists", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue({
			section: "tech",
			slug: "my-post",
		} as never)
		expect(await lookupLegacySlug("my-post")).toEqual({
			kind: "post",
			section: "tech",
			slug: "my-post",
		})
	})

	it("returns a project match when only projects has the slug", async () => {
		vi.mocked(prisma.project.findFirst).mockResolvedValue({
			slug: "my-app",
		} as never)
		expect(await lookupLegacySlug("my-app")).toEqual({
			kind: "project",
			slug: "my-app",
		})
	})

	it("prefers posts over projects when both share a slug", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue({
			section: "life",
			slug: "shared",
		} as never)
		vi.mocked(prisma.project.findFirst).mockResolvedValue({
			slug: "shared",
		} as never)
		expect(await lookupLegacySlug("shared")).toEqual({
			kind: "post",
			section: "life",
			slug: "shared",
		})
	})

	it("queries posts and projects in parallel regardless of which matches", async () => {
		await lookupLegacySlug("anything")
		expect(prisma.post.findFirst).toHaveBeenCalled()
		expect(prisma.project.findFirst).toHaveBeenCalled()
	})

	it("queries published posts by the slug arg, selecting only section and slug", async () => {
		await lookupLegacySlug("specific")
		expect(prisma.post.findFirst).toHaveBeenCalledWith({
			where: { slug: "specific", published: true },
			select: { section: true, slug: true },
		})
	})

	it("queries projects by the slug arg, selecting only slug", async () => {
		await lookupLegacySlug("specific")
		expect(prisma.project.findFirst).toHaveBeenCalledWith({
			where: { slug: "specific" },
			select: { slug: true },
		})
	})
})
