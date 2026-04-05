import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { GET } from "./route"

vi.mock("@/lib/db", () => ({
	prisma: {
		post: {
			findFirst: vi.fn(),
		},
	},
}))

const BASE = "https://localhost:3000"

function makeParams(slug: string) {
	return { params: Promise.resolve({ slug }) }
}

beforeEach(() => {
	vi.stubEnv("NEXTAUTH_URL", BASE)
})

describe("GET /api/legacy-redirect/[slug]", () => {
	it("returns 404 when no post matches the slug", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue(null)
		const response = await GET(
			new Request("http://localhost"),
			makeParams("old-slug")
		)
		expect(response.status).toBe(404)
	})

	it("redirects to /blog/:section/:slug when a post is found", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue({
			section: "tech",
			slug: "my-old-post",
		} as never)
		const response = await GET(
			new Request("http://localhost"),
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
			new Request("http://localhost"),
			makeParams("a-life-post")
		)
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toBe(
			`${BASE}/blog/life/a-life-post`
		)
	})

	it("queries by the slug from the route params", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue(null)
		await GET(new Request("http://localhost"), makeParams("specific-slug"))
		expect(prisma.post.findFirst).toHaveBeenCalledWith({
			where: { slug: "specific-slug" },
			select: { section: true, slug: true },
		})
	})
})
