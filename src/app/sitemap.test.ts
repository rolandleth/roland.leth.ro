import { beforeEach, describe, expect, it, vi } from "vitest"
import sitemap from "@/app/sitemap"
import { prisma } from "@/lib/db"
import { currentDatetimeString } from "@/lib/format"
import { siteBase } from "@/lib/request"

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db", () => ({
	prisma: {
		post: {
			findMany: vi.fn(),
		},
	},
}))

vi.mock("@/lib/format", () => ({
	currentDatetimeString: vi.fn().mockReturnValue("2025-06-01-1200"),
}))

vi.mock("@/lib/request", () => ({
	siteBase: vi.fn(),
}))

const BASE = "https://localhost:3000"

function postStub(
	overrides: {
		slug?: string
		section?: "tech" | "life"
		datetime?: string
		updatedAt?: Date
	} = {}
) {
	const datetime = overrides.datetime ?? "2025-06-01-1200"
	const dateOnly = datetime.slice(0, 10)

	return {
		slug: "my-post",
		section: "tech" as const,
		datetime,
		updatedAt: new Date(dateOnly),
		...overrides,
	}
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(siteBase).mockResolvedValue(BASE)
	vi.mocked(prisma.post.findMany).mockResolvedValue([])
	// `getAllPublishedPostSlugs` now reads `currentDatetimeString()` inside the
	// cached fn for the `datetime <= now` filter; `resetAllMocks` clears the
	// factory's `mockReturnValue`, so restore it here.
	vi.mocked(currentDatetimeString).mockReturnValue("2025-06-01-1200")
})

// #region Static routes

describe("sitemap — static routes", () => {
	it("includes the home page with priority 1.0", async () => {
		const result = await sitemap()
		const route = result.find((r) => r.url === `${BASE}/`)
		expect(route).toBeDefined()
		expect(route?.priority).toBe(1.0)
	})

	it("includes the about page with priority 0.7", async () => {
		const result = await sitemap()
		const route = result.find((r) => r.url === `${BASE}/about`)
		expect(route).toBeDefined()
		expect(route?.priority).toBe(0.7)
	})

	it("includes the tech blog index with priority 0.8", async () => {
		const result = await sitemap()
		const route = result.find((r) => r.url === `${BASE}/blog/tech`)
		expect(route).toBeDefined()
		expect(route?.priority).toBe(0.8)
	})

	it("includes the life blog index with priority 0.8", async () => {
		const result = await sitemap()
		const route = result.find((r) => r.url === `${BASE}/blog/life`)
		expect(route).toBeDefined()
		expect(route?.priority).toBe(0.8)
	})

	it("includes the tech archive with priority 0.5", async () => {
		const result = await sitemap()
		const route = result.find((r) => r.url === `${BASE}/blog/tech/archive`)
		expect(route).toBeDefined()
		expect(route?.priority).toBe(0.5)
	})

	it("includes the life archive with priority 0.5", async () => {
		const result = await sitemap()
		const route = result.find((r) => r.url === `${BASE}/blog/life/archive`)
		expect(route).toBeDefined()
		expect(route?.priority).toBe(0.5)
	})

	it("returns only 6 static routes when there are no posts", async () => {
		const result = await sitemap()
		// home + about + 2 section indexes + 2 archives
		expect(result).toHaveLength(6)
	})

	it("marks all static routes as changeFrequency 'weekly'", async () => {
		const result = await sitemap()
		const allWeekly = result.every((r) => r.changeFrequency === "weekly")
		expect(allWeekly).toBe(true)
	})
})

// #endregion

// #region Post routes

describe("sitemap — post routes", () => {
	it("includes a route for each published post", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			postStub({ slug: "first-post", section: "tech" }) as never,
			postStub({ slug: "second-post", section: "life" }) as never,
		])
		const result = await sitemap()
		expect(result).toContainEqual(
			expect.objectContaining({ url: `${BASE}/blog/tech/first-post` })
		)
		expect(result).toContainEqual(
			expect.objectContaining({ url: `${BASE}/blog/life/second-post` })
		)
	})

	it("sets post priority to 0.6", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([postStub() as never])
		const result = await sitemap()
		const route = result.find((r) => r.url.includes("/blog/tech/my-post"))
		expect(route?.priority).toBe(0.6)
	})

	it("sets post changeFrequency to 'never'", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([postStub() as never])
		const result = await sitemap()
		const route = result.find((r) => r.url.includes("/blog/tech/my-post"))
		expect(route?.changeFrequency).toBe("never")
	})

	it("parses the date portion of datetime for lastModified", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			postStub({ datetime: "2024-03-15-0900" }) as never,
		])
		const result = await sitemap()
		const route = result.find((r) => r.url.includes("/blog/tech/my-post"))
		expect(route?.lastModified).toEqual(new Date("2024-03-15"))
	})

	it("ignores the time portion of datetime when setting lastModified", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			postStub({ datetime: "2024-03-15-2359" }) as never,
		])
		const result = await sitemap()
		const route = result.find((r) => r.url.includes("/blog/tech/my-post"))
		expect(route?.lastModified).toEqual(new Date("2024-03-15"))
	})

	it("combines static and post routes", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([postStub() as never])
		const result = await sitemap()
		// 6 static + 1 post
		expect(result).toHaveLength(7)
	})

	it("filters to published, currently-live posts at the DB query", async () => {
		// Both `published: true` AND `datetime <= now` so search engines don't
		// crawl scheduled posts before their publish time, mirroring the public
		// listing/feed behavior.
		await sitemap()
		const call = vi.mocked(prisma.post.findMany).mock.calls[0][0] as {
			where: Record<string, unknown>
		}
		expect(call.where.published).toBe(true)
		expect(call.where.datetime).toEqual({ lte: expect.any(String) })
	})

	it("does not crash when a post has a malformed datetime string", async () => {
		// Sitemap uses `post.updatedAt` (a Date), not `datetime`, so a malformed
		// datetime string should be irrelevant to route emission. This pins that
		// contract so a future refactor that swaps in a parser can't regress silently.
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			postStub({
				slug: "weird-post",
				datetime: "not-a-date",
				updatedAt: new Date("2024-01-01"),
			}) as never,
		])

		const result = await sitemap()
		const route = result.find((r) => r.url.includes("/blog/tech/weird-post"))
		expect(route).toBeDefined()
		expect(route?.lastModified).toEqual(new Date("2024-01-01"))
	})
})

// #endregion
