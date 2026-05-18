import { beforeEach, describe, expect, it, vi } from "vitest"
import sitemap from "@/app/sitemap"
import { siteBase } from "@/lib/api/request"
import { prisma } from "@/lib/db/db"
import { currentDatetimeString } from "@/lib/utils/format"

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db/db", () => ({
	prisma: {
		post: {
			findMany: vi.fn(),
		},
		project: {
			findMany: vi.fn(),
		},
	},
}))

vi.mock("@/lib/utils/format", () => ({
	currentDatetimeString: vi.fn().mockReturnValue("2025-06-01-1200"),
}))

vi.mock("@/lib/api/request", () => ({
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
	vi.mocked(prisma.project.findMany).mockResolvedValue([])
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

	it("includes the projects gallery with priority 0.8", async () => {
		const result = await sitemap()
		const route = result.find((r) => r.url === `${BASE}/projects`)
		expect(route).toBeDefined()
		expect(route?.priority).toBe(0.8)
	})

	it("includes the loan calculator tool", async () => {
		const result = await sitemap()
		const route = result.find((r) => r.url === `${BASE}/tools/loan-calculator`)
		expect(route).toBeDefined()
		expect(route?.changeFrequency).toBe("monthly")
	})

	it("includes the privacy index", async () => {
		const result = await sitemap()
		const route = result.find((r) => r.url === `${BASE}/privacy`)
		expect(route).toBeDefined()
		expect(route?.changeFrequency).toBe("yearly")
	})

	it("includes the body-tracking privacy subpage", async () => {
		const result = await sitemap()
		const route = result.find((r) => r.url === `${BASE}/privacy/body-tracking`)
		expect(route).toBeDefined()
		expect(route?.changeFrequency).toBe("yearly")
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

	it("returns 10 static routes when there are no posts or projects", async () => {
		const result = await sitemap()
		// home + about + projects + tools/loan-calculator + privacy + privacy/body-tracking
		// + 2 section indexes + 2 archives
		expect(result).toHaveLength(10)
	})

	it("marks home/about/projects/blog-index/archive routes as 'weekly'", async () => {
		const result = await sitemap()
		const weeklyRoutes = [
			`${BASE}/`,
			`${BASE}/about`,
			`${BASE}/projects`,
			`${BASE}/blog/tech`,
			`${BASE}/blog/life`,
			`${BASE}/blog/tech/archive`,
			`${BASE}/blog/life/archive`,
		]

		for (const url of weeklyRoutes) {
			const route = result.find((r) => r.url === url)
			expect(route?.changeFrequency).toBe("weekly")
		}
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
		// 10 static + 1 post
		expect(result).toHaveLength(11)
	})

	it("queries every published post (including scheduled) so the read-time filter can surface them", async () => {
		// The cache holds scheduled rows so they auto-surface in the sitemap
		// once their `datetime` passes; the read-time filter (in
		// `getAllPublishedPostSlugs`) keeps search engines from crawling them
		// in the meantime.
		await sitemap()
		const call = vi.mocked(prisma.post.findMany).mock.calls[0][0] as {
			where: Record<string, unknown>
		}
		expect(call.where.published).toBe(true)
		expect(call.where).not.toHaveProperty("datetime")
	})

	it("excludes scheduled (future-dated) post URLs from the sitemap output", async () => {
		// End-to-end check of the read-time filter: `getAllPublishedPostSlugs`
		// strips scheduled rows so the sitemap reflects only currently-live
		// posts, mirroring the public listing/feed behavior.
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			postStub({ slug: "live", datetime: "2024-01-01-1200" }) as never,
			postStub({ slug: "scheduled", datetime: "9999-12-31-2359" }) as never,
		])

		const result = await sitemap()
		expect(result.find((r) => r.url.endsWith("/live"))).toBeDefined()
		expect(result.find((r) => r.url.endsWith("/scheduled"))).toBeUndefined()
	})

	it("does not crash when a post has a malformed datetime string", async () => {
		// Sitemap uses `post.updatedAt` (a Date), not `datetime`, so a malformed
		// datetime string should be irrelevant to route emission. This pins that
		// contract so a future refactor that swaps in a parser can't regress silently.
		// The datetime must still be lex-`<=` the current time so the
		// scheduled-post read-time filter in `getAllPublishedPostSlugs` doesn't
		// exclude the row before this contract is exercised.
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			postStub({
				slug: "weird-post",
				datetime: "2020-bad-format",
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

// #region Project routes

describe("sitemap — project routes", () => {
	it("includes a route for each project", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue([
			{ slug: "my-app", updatedAt: new Date("2024-04-01") },
			{ slug: "another-app", updatedAt: new Date("2024-05-01") },
		] as never)

		const result = await sitemap()
		expect(result).toContainEqual(
			expect.objectContaining({ url: `${BASE}/projects/my-app` })
		)
		expect(result).toContainEqual(
			expect.objectContaining({ url: `${BASE}/projects/another-app` })
		)
	})

	it("sets project priority to 0.6 and changeFrequency 'monthly'", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue([
			{ slug: "my-app", updatedAt: new Date("2024-04-01") },
		] as never)

		const result = await sitemap()
		const route = result.find((r) => r.url === `${BASE}/projects/my-app`)
		expect(route?.priority).toBe(0.6)
		expect(route?.changeFrequency).toBe("monthly")
	})

	it("propagates updatedAt to lastModified", async () => {
		const updatedAt = new Date("2024-04-15")
		vi.mocked(prisma.project.findMany).mockResolvedValue([
			{ slug: "my-app", updatedAt },
		] as never)

		const result = await sitemap()
		const route = result.find((r) => r.url === `${BASE}/projects/my-app`)
		expect(route?.lastModified).toEqual(updatedAt)
	})
})

// #endregion
