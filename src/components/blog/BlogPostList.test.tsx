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

// #region Rendering

describe("BlogPostList — rendering", () => {
	it("renders page 1 of an empty section", async () => {
		// An empty section is a legitimately empty list, not a missing page —
		// the guard below only fires for page > 1.
		vi.mocked(getPostsBySection).mockResolvedValue({ posts: [], totalPages: 0 })

		await expect(
			BlogPostList({ section: "tech", page: 1 })
		).resolves.toBeTruthy()
		expect(notFound).not.toHaveBeenCalled()
	})

	it("renders a page that has posts", async () => {
		vi.mocked(getPostsBySection).mockResolvedValue({
			posts: [makePost({ slug: "one" })],
			totalPages: 3,
		})

		await expect(
			BlogPostList({ section: "tech", page: 2 })
		).resolves.toBeTruthy()
	})
})

// #endregion

// #region Out-of-range pages

describe("BlogPostList — out-of-range pages", () => {
	it("404s an empty page past the first", async () => {
		// `isRealPage` (at the `/p/:page` route) and `getPostsBySection`'s
		// `totalPages` read the same cache entry, but that entry can still change
		// value BETWEEN `isRealPage`'s read and this component's own —
		// `unstable_cache` serves a stale value immediately after a bust and
		// regenerates in the background. This is the backstop for a page that
		// was real when `isRealPage` checked and isn't any more, most plausibly
		// after an unpublish or delete. See the component's own docblock.
		vi.mocked(getPostsBySection).mockResolvedValue({ posts: [], totalPages: 2 })

		await expect(BlogPostList({ section: "tech", page: 5 })).rejects.toThrow()
		expect(notFound).toHaveBeenCalled()
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
