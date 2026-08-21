import { beforeEach, describe, expect, it, vi } from "vitest"
import BlogPostList from "@/components/blog/BlogPostList"
import { getPostsBySection } from "@/lib/db/posts"
import { makePost } from "@/test/fixtures"

vi.mock("@/lib/db/posts", () => ({
	getPostsBySection: vi.fn(),
}))

beforeEach(() => {
	vi.clearAllMocks()
})

// #region Rendering

describe("BlogPostList — rendering", () => {
	it("renders page 1 of an empty section", async () => {
		// An empty section is a legitimately empty list — the route, not this
		// component, is responsible for 404ing an out-of-range page (see
		// `isRealPage` on `/blog/:section/p/:page`).
		vi.mocked(getPostsBySection).mockResolvedValue({ posts: [], totalPages: 0 })

		await expect(
			BlogPostList({ section: "tech", page: 1 })
		).resolves.toBeTruthy()
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
