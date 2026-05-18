import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadPost } from "@/lib/posts"
import PostPage, { generateMetadata } from "./page"

vi.mock("@/lib/posts", () => ({
	getAllPublishedPostSlugs: vi.fn().mockResolvedValue([]),
	loadPost: vi.fn(),
}))

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NOT_FOUND")
	}),
}))

vi.mock("@/components/blog/PostContent", () => ({
	default: function MockPostContent() {
		return null
	},
}))

vi.mock("@/components/blog/PostMarkdownContent", () => ({
	default: function MockPostMarkdownContent() {
		return null
	},
}))

function paramsFor(section: string, slug: string) {
	return { params: Promise.resolve({ section, slug }) }
}

const existingPost = {
	id: 1,
	title: "Hello",
	body: "Content",
	section: "tech" as const,
	datetime: "2025-01-01-1200",
	published: true,
	summary: "Content",
	imageUrl: null,
	readingTime: null,
	slug: "hello",
	createdAt: new Date(),
	updatedAt: new Date(),
}

beforeEach(() => {
	vi.resetAllMocks()
})

describe("PostPage", () => {
	it("calls notFound for an invalid section", async () => {
		await expect(PostPage(paramsFor("garbage", "hello"))).rejects.toThrow(
			"NOT_FOUND"
		)
	})

	it("calls notFound when the post does not exist", async () => {
		vi.mocked(loadPost).mockResolvedValue(null)
		await expect(PostPage(paramsFor("tech", "missing"))).rejects.toThrow(
			"NOT_FOUND"
		)
	})

	it("renders when both section and post are valid", async () => {
		vi.mocked(loadPost).mockResolvedValue(existingPost)
		const result = await PostPage(paramsFor("tech", "hello"))
		expect(result).toBeDefined()
	})
})

describe("generateMetadata", () => {
	it("returns empty metadata for an invalid section (so the page itself can 404)", async () => {
		const result = await generateMetadata(paramsFor("garbage", "hello"))
		expect(result).toEqual({})
	})

	it("returns empty metadata when the post does not exist", async () => {
		vi.mocked(loadPost).mockResolvedValue(null)
		const result = await generateMetadata(paramsFor("tech", "missing"))
		expect(result).toEqual({})
	})

	it("returns title + article metadata for a valid post", async () => {
		vi.mocked(loadPost).mockResolvedValue(existingPost)
		const result = await generateMetadata(paramsFor("tech", "hello"))
		expect(result.title).toBe("Hello")
		// `Metadata.openGraph` is a discriminated union; cast to read the
		// type discriminator without narrowing in the test.
		const og = result.openGraph as { type?: string } | undefined
		expect(og?.type).toBe("article")
	})
})
