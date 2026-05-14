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
	// `lookupLegacySlug` reads `currentDatetimeString()` at the read-time
	// filter step (post-cache). `clearAllMocks` clears the factory's
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
			datetime: "2024-06-01-1200",
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
			datetime: "2024-06-01-1200",
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

	it("queries published posts by the slug arg, selecting section/slug/datetime for the read-time filter", async () => {
		// `datetime <= now` is NOT in the where clause — the cache stores the
		// row regardless and the filter happens at read time so a scheduled
		// post's legacy alias auto-redirects once its `datetime` passes.
		await lookupLegacySlug("specific")
		expect(prisma.post.findFirst).toHaveBeenCalledWith({
			where: {
				slug: "specific",
				published: true,
			},
			select: { section: true, slug: true, datetime: true },
		})
	})

	it("queries projects by the slug arg, selecting only slug", async () => {
		await lookupLegacySlug("specific")
		expect(prisma.project.findFirst).toHaveBeenCalledWith({
			where: { slug: "specific" },
			select: { slug: true },
		})
	})

	it("returns null for a future-dated post (read-time filter)", async () => {
		// The cached row exists so it can auto-surface as its `datetime`
		// passes; until then `lookupLegacySlug` keeps the legacy alias from
		// 308-redirecting to a canonical page that itself would 404.
		vi.mocked(prisma.post.findFirst).mockResolvedValue({
			section: "tech",
			slug: "scheduled",
			datetime: "9999-12-31-2359",
		} as never)
		vi.mocked(prisma.project.findFirst).mockResolvedValue(null)
		expect(await lookupLegacySlug("scheduled")).toBeNull()
	})
})
