import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadPost } from "@/lib/db/posts"
import { GET } from "./route"

vi.mock("@/lib/db/posts", () => ({
	loadPost: vi.fn(),
}))

function makeArgs(section: string, slug: string) {
	return [
		new Request(`http://localhost/api/blog/${section}/${slug}/md`),
		{ params: Promise.resolve({ section, slug }) },
	] as const
}

const existingPost = {
	id: 1,
	title: "Hello World",
	slug: "hello-world",
	section: "tech" as const,
	datetime: "2024-01-15-0930",
	body: "First paragraph.\n\nSecond paragraph.",
	summary: "A short summary.",
	imageUrl: null,
	readingTime: null,
	updatedAt: new Date("2024-01-15T09:30:00.000Z"),
}

beforeEach(() => {
	vi.resetAllMocks()
})

describe("GET /api/blog/:section/:slug/md", () => {
	it("returns 404 for an invalid section without hitting the DB", async () => {
		const response = await GET(...makeArgs("garbage", "hello-world"))
		expect(response.status).toBe(404)
		expect(loadPost).not.toHaveBeenCalled()
	})

	it("returns 404 when the post does not exist", async () => {
		vi.mocked(loadPost).mockResolvedValue(null)
		const response = await GET(...makeArgs("tech", "missing"))
		expect(response.status).toBe(404)
	})

	it("returns 200 markdown with the frontmatter + body for a valid post", async () => {
		vi.mocked(loadPost).mockResolvedValue(existingPost)
		const response = await GET(...makeArgs("tech", "hello-world"))

		expect(response.status).toBe(200)
		expect(response.headers.get("Content-Type")).toContain("text/markdown")

		const text = await response.text()
		expect(text).toContain('title: "Hello World"')
		expect(text).toContain(
			"canonical: https://roland.leth.ro/blog/tech/hello-world"
		)
		expect(text).toContain("First paragraph.\n\nSecond paragraph.")
	})

	it("sets a CDN cache-control header matching the other public route handlers", async () => {
		vi.mocked(loadPost).mockResolvedValue(existingPost)
		const response = await GET(...makeArgs("tech", "hello-world"))
		expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600")
	})
})
