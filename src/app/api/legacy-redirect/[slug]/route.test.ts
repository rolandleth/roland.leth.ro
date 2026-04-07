import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { GET } from "./route"

vi.mock("@/lib/db", () => ({
	prisma: {
		post: {
			findFirst: vi.fn(),
		},
		project: {
			findFirst: vi.fn(),
		},
	},
}))

const BASE = "https://localhost:3000"

function makeRequest(slug: string) {
	return new Request(`${BASE}/api/legacy-redirect/${slug}`)
}

function makeParams(slug: string) {
	return { params: Promise.resolve({ slug }) }
}

beforeEach(() => {
	vi.clearAllMocks()
	vi.mocked(prisma.post.findFirst).mockResolvedValue(null)
	vi.mocked(prisma.project.findFirst).mockResolvedValue(null)
})

describe("GET /api/legacy-redirect/[slug]", () => {
	it("returns 404 when neither post nor project matches the slug", async () => {
		const response = await GET(makeRequest("old-slug"), makeParams("old-slug"))
		expect(response.status).toBe(404)
	})

	it("redirects to /blog/:section/:slug when a post is found", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue({
			section: "tech",
			slug: "my-old-post",
		} as never)
		const response = await GET(
			makeRequest("my-old-post"),
			makeParams("my-old-post")
		)
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toBe(
			`${BASE}/blog/tech/my-old-post`
		)
	})

	it("redirects to the correct section for life posts", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue({
			section: "life",
			slug: "a-life-post",
		} as never)
		const response = await GET(
			makeRequest("a-life-post"),
			makeParams("a-life-post")
		)
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toBe(
			`${BASE}/blog/life/a-life-post`
		)
	})

	it("queries posts by the slug from the route params", async () => {
		await GET(makeRequest("specific-slug"), makeParams("specific-slug"))
		expect(prisma.post.findFirst).toHaveBeenCalledWith({
			where: { slug: "specific-slug" },
			select: { section: true, slug: true },
		})
	})

	it("redirects to /projects/:slug when a project is found", async () => {
		vi.mocked(prisma.project.findFirst).mockResolvedValue({
			slug: "my-app",
		} as never)
		const response = await GET(makeRequest("my-app"), makeParams("my-app"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toBe(`${BASE}/projects/my-app`)
	})

	it("does not query projects when a post is found", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue({
			section: "tech",
			slug: "a-post",
		} as never)
		await GET(makeRequest("a-post"), makeParams("a-post"))
		expect(prisma.project.findFirst).not.toHaveBeenCalled()
	})

	it("queries projects by the slug from the route params", async () => {
		await GET(makeRequest("specific-slug"), makeParams("specific-slug"))
		expect(prisma.project.findFirst).toHaveBeenCalledWith({
			where: { slug: "specific-slug" },
			select: { slug: true },
		})
	})

	it("derives the redirect base from the request URL", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue({
			section: "tech",
			slug: "a-post",
		} as never)
		const response = await GET(
			new Request("https://rolandleth.com/api/legacy-redirect/a-post"),
			makeParams("a-post")
		)
		expect(response.headers.get("location")).toBe(
			"https://rolandleth.com/blog/tech/a-post"
		)
	})
})
