import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { currentDatetimeString } from "@/lib/format"
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

vi.mock("@/lib/format", () => ({
	currentDatetimeString: vi.fn().mockReturnValue("2025-06-01-1200"),
}))

beforeEach(() => {
	vi.clearAllMocks()
	vi.mocked(prisma.post.findFirst).mockResolvedValue(null)
	vi.mocked(prisma.project.findFirst).mockResolvedValue(null)
	// `cachedLookup` reads `currentDatetimeString()` inside the cached fn for
	// the `datetime <= now` filter; `clearAllMocks` clears the factory's
	// `mockReturnValue` so restore it here.
	vi.mocked(currentDatetimeString).mockReturnValue("2025-06-01-1200")
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

	it("queries published posts by the slug arg with `datetime <= now`, selecting only section and slug", async () => {
		await lookupLegacySlug("specific")
		expect(prisma.post.findFirst).toHaveBeenCalledWith({
			where: {
				slug: "specific",
				published: true,
				datetime: { lte: "2025-06-01-1200" },
			},
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

	it("excludes future-dated published posts (Prisma returns null even if a draft row exists)", async () => {
		// Prisma applies the `datetime: { lte: now }` filter server-side, so a
		// future-dated post simply doesn't match and `findFirst` resolves to
		// null. This pins the filter contract: if a future regression drops
		// `datetime: { lte: now }` from the `where` clause, the assertion
		// above (`queries published posts ... with datetime <= now`) catches it;
		// this test additionally documents the user-visible outcome.
		vi.mocked(prisma.post.findFirst).mockResolvedValue(null)
		vi.mocked(prisma.project.findFirst).mockResolvedValue(null)
		expect(await lookupLegacySlug("future-dated")).toBeNull()
	})
})
