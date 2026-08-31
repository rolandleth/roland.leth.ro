import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	getAllPublishedPostSlugs,
	loadPost,
	loadScheduledPost,
} from "@/lib/db/posts"
import { dynamic, generateStaticParams, GET } from "./route"
import * as mdRoute from "./route"

vi.mock("@/lib/db/posts", () => ({
	loadPost: vi.fn(),
	loadScheduledPost: vi.fn(),
	getAllPublishedPostSlugs: vi.fn(),
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

	it("returns a 200 noindex stub for a scheduled post", async () => {
		vi.mocked(loadPost).mockResolvedValue(null)
		vi.mocked(loadScheduledPost).mockResolvedValue({
			title: "Hello World",
			datetime: "2999-01-01-0900",
		})

		const response = await GET(...makeArgs("tech", "hello-world"))

		expect(response.status).toBe(200)
		expect(response.headers.get("Content-Type")).toContain("text/markdown")
		expect(response.headers.get("X-Robots-Tag")).toBe("noindex")

		const text = await response.text()
		expect(text).toContain("# Hello World")
		expect(text).toContain("Jan 1, 2999")
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

	it("sets no hand-rolled Cache-Control", async () => {
		// A hand-set `s-maxage` lands on the CDN copy, where `revalidateTag` can't
		// reach it — an edited post would serve stale markdown until the window
		// expired. Freshness is the route cache's job now, via the tags
		// `getPostBySlug` puts on the entry.
		vi.mocked(loadPost).mockResolvedValue(existingPost)
		const response = await GET(...makeArgs("tech", "hello-world"))
		expect(response.headers.get("Cache-Control")).toBeNull()
	})
})

describe("static generation", () => {
	it("prerenders per post with no time-based revalidate", async () => {
		// `force-static` is what takes the rewrite hit off the function path and
		// lets the per-post tag bust regenerate the served markdown. A `revalidate`
		// window here would regenerate every post's `.md` on a timer whether or not
		// anything changed — the cost the feed route shed in 2026-08-15.
		expect(dynamic).toBe("force-static")
		expect(mdRoute).not.toHaveProperty("revalidate")
	})

	it("generates the same params as the post page, scheduled posts excluded", async () => {
		// Shares `getAllPublishedPostSlugs` with the page's own
		// `generateStaticParams`, which applies the `datetime <= now` filter, so the
		// two views of a post can never be generated for different sets.
		vi.mocked(getAllPublishedPostSlugs).mockResolvedValue([
			{
				section: "tech",
				slug: "hello-world",
				datetime: "2024-01-15-0930",
				updatedAt: new Date("2024-01-15T09:30:00.000Z"),
			},
			{
				section: "life",
				slug: "on-reading",
				datetime: "2024-02-01-1200",
				updatedAt: new Date("2024-02-01T12:00:00.000Z"),
			},
		])

		expect(await generateStaticParams()).toEqual([
			{ section: "tech", slug: "hello-world" },
			{ section: "life", slug: "on-reading" },
		])
	})
})
