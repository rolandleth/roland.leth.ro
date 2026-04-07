import { beforeEach, describe, expect, it, vi } from "vitest"
import sitemap from "@/app/sitemap"
import { prisma } from "@/lib/db"
import { siteBase } from "@/lib/request"

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
	overrides: { slug?: string; section?: string; datetime?: string } = {}
) {
	return {
		slug: "my-post",
		section: "tech",
		datetime: "2025-06-01-1200",
		...overrides,
	}
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(siteBase).mockResolvedValue(BASE)
	vi.mocked(prisma.post.findMany).mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// Static routes
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Post routes
// ---------------------------------------------------------------------------

describe("sitemap — post routes", () => {
	it("includes a route for each published post", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			postStub({ slug: "first-post", section: "tech" }) as never,
			postStub({ slug: "second-post", section: "life" }) as never,
		])
		const result = await sitemap()
		expect(result.some((r) => r.url === `${BASE}/blog/tech/first-post`)).toBe(
			true
		)
		expect(result.some((r) => r.url === `${BASE}/blog/life/second-post`)).toBe(
			true
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
})
