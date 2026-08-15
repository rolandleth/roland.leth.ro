import { notFound } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import BlogPostList from "@/components/blog/BlogPostList"
import { getPostsBySection } from "@/lib/db/posts"
import { makePost } from "@/test/fixtures"

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NEXT_NOT_FOUND")
	}),
}))

vi.mock("@/lib/db/posts", () => ({
	getPostsBySection: vi.fn(),
}))

beforeEach(() => {
	vi.clearAllMocks()
})

// #region Out-of-range pages

describe("BlogPostList — out-of-range pages", () => {
	it("404s an empty page past the first", async () => {
		// Both list routes are prerendered, so a page that existed at build time
		// can stop existing once a post is deleted. Without this it keeps
		// serving an empty list under a URL that should no longer resolve.
		vi.mocked(getPostsBySection).mockResolvedValue({ posts: [], totalPages: 2 })

		await expect(BlogPostList({ section: "tech", page: 5 })).rejects.toThrow()
		expect(notFound).toHaveBeenCalled()
	})

	it("renders page 1 of an empty section instead of 404ing", async () => {
		// An empty section is a legitimately empty list, not a missing page —
		// 404ing here would break a brand-new section with no posts yet.
		vi.mocked(getPostsBySection).mockResolvedValue({ posts: [], totalPages: 0 })

		await expect(
			BlogPostList({ section: "tech", page: 1 })
		).resolves.toBeTruthy()
		expect(notFound).not.toHaveBeenCalled()
	})

	it("renders a page that still has posts", async () => {
		vi.mocked(getPostsBySection).mockResolvedValue({
			posts: [makePost({ slug: "one" })],
			totalPages: 3,
		})

		await expect(
			BlogPostList({ section: "tech", page: 2 })
		).resolves.toBeTruthy()
		expect(notFound).not.toHaveBeenCalled()
	})
})

// #endregion

// #region Data fetching

describe("BlogPostList — data fetching", () => {
	it("requests the page it was asked for", async () => {
		vi.mocked(getPostsBySection).mockResolvedValue({
			posts: [makePost()],
			totalPages: 4,
		})

		await BlogPostList({ section: "life", page: 3 })

		expect(getPostsBySection).toHaveBeenCalledWith("life", 3)
	})
})

// #endregion
