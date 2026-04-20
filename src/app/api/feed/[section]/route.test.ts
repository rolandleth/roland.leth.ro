import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { markdownToHtml, stripMarkdown } from "@/lib/markdown"
import { GET } from "./route"

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db", () => ({
	prisma: { post: { findMany: vi.fn() } },
}))

vi.mock("@/lib/markdown", () => ({
	markdownToHtml: vi.fn(async (md: string) => `<p>${md}</p>`),
	stripMarkdown: vi.fn((md: string) => md),
}))

function makeRequest(section: string) {
	return [
		new Request(`http://localhost/api/feed/${section}`),
		{ params: Promise.resolve({ section }) },
	] as const
}

const basePost = {
	id: 1,
	title: "Test Post",
	slug: "test-post",
	section: "tech" as const,
	datetime: "2024-01-01-0900",
	body: "Some content.",
	summary: "A short summary.",
	imageUrl: null,
	readingTime: null,
	published: true,
	createdAt: new Date("2024-01-01T09:00:00.000Z"),
	updatedAt: new Date("2024-01-01T09:00:00.000Z"),
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(markdownToHtml).mockImplementation(async (md) => `<p>${md}</p>`)
	vi.mocked(stripMarkdown).mockImplementation((md) => md)
	vi.mocked(prisma.post.findMany).mockResolvedValue([])
})

describe("GET /api/feed/:section", () => {
	it("returns 404 for an invalid section", async () => {
		const response = await GET(...makeRequest("invalid"))
		expect(response.status).toBe(404)
	})

	it("returns 200 with Atom XML content type for a valid section", async () => {
		const response = await GET(...makeRequest("tech"))
		expect(response.status).toBe(200)
		expect(response.headers.get("Content-Type")).toContain(
			"application/atom+xml"
		)
	})

	it("includes the feed title, self link, and blog link", async () => {
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain("<title>Roland Leth — Tech blog</title>")
		expect(text).toContain('href="http://localhost/api/feed/tech" rel="self"')
		expect(text).toContain('href="http://localhost/blog/tech"')
	})

	it("includes all required Atom entry elements", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([basePost])
		const text = await GET(...makeRequest("tech")).then((r) => r.text())

		expect(text).toContain("<title>Test Post</title>")
		expect(text).toContain('href="http://localhost/blog/tech/test-post"')
		expect(text).toContain("<published>")
		expect(text).toContain("<updated>2024-01-01T09:00:00.000Z</updated>")
		expect(text).toContain("<summary>")
		expect(text).toContain('<content type="html">')
	})

	it("uses the DB summary field when present", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([basePost])
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain("<summary>A short summary.</summary>")
	})

	it("falls back to a stripped body excerpt when summary is null", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			{ ...basePost, summary: null },
		])
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain("<summary>Some content.</summary>")
	})

	it("truncates the fallback summary to 300 characters", async () => {
		const longBody = "a".repeat(400)
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			{ ...basePost, summary: null, body: longBody },
		])
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain(`<summary>${"a".repeat(300)}</summary>`)
	})

	it("renders the post body as HTML in the content element", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([basePost])
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain(
			'<content type="html"><![CDATA[<p>Some content.</p>]]></content>'
		)
	})

	it("escapes XML-special characters in post titles", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			{ ...basePost, title: "A & <B>" },
		])
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain("<title>A &amp; &lt;B&gt;</title>")
	})

	it("sets feed <updated> to the most recent post updatedAt", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			{ ...basePost, updatedAt: new Date("2024-03-01T00:00:00.000Z") },
			{ ...basePost, updatedAt: new Date("2024-06-01T00:00:00.000Z") },
			{ ...basePost, updatedAt: new Date("2024-01-01T00:00:00.000Z") },
		])
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain("<updated>2024-06-01T00:00:00.000Z</updated>")
	})

	it("returns a valid feed with no entries when there are no posts", async () => {
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain("<feed")
		expect(text).not.toContain("<entry>")
	})
})
