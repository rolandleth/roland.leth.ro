import { revalidateTag } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Post } from "@/generated/prisma/client"
import { prisma } from "@/lib/db"
import {
	bySection,
	getPostBySlug,
	getPostsBySection,
	getPostsGroupedByYear,
	PAGE_SIZE,
	revalidatePostSection,
	searchPosts,
} from "@/lib/posts"

vi.mock("next/cache", () => ({
	unstable_cache: (fn: () => Promise<unknown>) => fn,
	revalidateTag: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
	prisma: {
		post: {
			findMany: vi.fn(),
			findUnique: vi.fn(),
			count: vi.fn(),
		},
	},
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(overrides: {
	title?: string
	body?: string
	datetime?: string
	slug?: string
	section?: string
	readingTime?: string | null
}) {
	return {
		title: "Default Title",
		body: "Default body content.",
		datetime: "2024-06-01-1200",
		slug: "default-title",
		section: "tech",
		readingTime: "2 min read",
		...overrides,
	}
}

beforeEach(() => {
	vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// getPostsBySection
// ---------------------------------------------------------------------------

describe("getPostsBySection", () => {
	it("returns posts and totalPages for a single page of results", async () => {
		const posts = [makePost({})]
		vi.mocked(prisma.post.findMany).mockResolvedValue(
			posts as unknown as Post[]
		)
		vi.mocked(prisma.post.count).mockResolvedValue(1)

		const result = await getPostsBySection("tech")
		expect(result.posts).toEqual(posts)
		expect(result.totalPages).toBe(1)
	})

	it("calculates totalPages correctly when results span multiple pages", async () => {
		// 25 posts with PAGE_SIZE=10 → 3 pages
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(PAGE_SIZE * 2 + 5)

		const { totalPages } = await getPostsBySection("tech")
		expect(totalPages).toBe(3)
	})

	it("returns totalPages of 1 when count equals PAGE_SIZE exactly", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(PAGE_SIZE)

		const { totalPages } = await getPostsBySection("tech")
		expect(totalPages).toBe(1)
	})

	it("returns totalPages of 0 when there are no posts", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		const { totalPages } = await getPostsBySection("tech")
		expect(totalPages).toBe(0)
	})

	it("queries with skip: 0 for page 1", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await getPostsBySection("tech", 1)

		expect(prisma.post.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ skip: 0, take: PAGE_SIZE })
		)
	})

	it("queries with the correct skip offset for page 2", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await getPostsBySection("tech", 2)

		expect(prisma.post.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ skip: PAGE_SIZE, take: PAGE_SIZE })
		)
	})

	it("queries with the correct skip offset for page 3", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await getPostsBySection("tech", 3)

		expect(prisma.post.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ skip: PAGE_SIZE * 2, take: PAGE_SIZE })
		)
	})
})

// ---------------------------------------------------------------------------
// getPostsGroupedByYear
// ---------------------------------------------------------------------------

describe("getPostsGroupedByYear", () => {
	it("groups posts by the year extracted from their datetime", async () => {
		const posts = [
			makePost({ datetime: "2023-11-15-0900", title: "Post D" }),
			makePost({ datetime: "2024-06-20-1400", title: "Post C" }),
			makePost({ datetime: "2024-06-20-1400", title: "Post C" }),
			makePost({ datetime: "2025-03-01-1000", title: "Post A" }),
		]
		vi.mocked(prisma.post.findMany).mockResolvedValue(
			posts as unknown as Post[]
		)

		const groups = await getPostsGroupedByYear("tech")
		expect(Object.keys(groups)).toEqual(["2023", "2024", "2025"])
		expect(groups["2025"]).toHaveLength(1)
		expect(groups["2024"]).toHaveLength(2)
	})

	it("creates one entry per unique year", async () => {
		const posts = [
			makePost({ datetime: "2023-01-01-0000" }),
			makePost({ datetime: "2022-06-01-0000" }),
			makePost({ datetime: "2021-12-31-2359" }),
		]
		vi.mocked(prisma.post.findMany).mockResolvedValue(
			posts as unknown as Post[]
		)

		const groups = await getPostsGroupedByYear("tech")
		expect(Object.keys(groups)).toHaveLength(3)
	})

	it("returns an empty object when there are no posts", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])

		const groups = await getPostsGroupedByYear("tech")
		expect(groups).toEqual({})
	})
})

// ---------------------------------------------------------------------------
// getPostBySlug
// ---------------------------------------------------------------------------

describe("getPostBySlug", () => {
	const postDetail = {
		id: 1,
		title: "My Post",
		slug: "my-post",
		section: "tech",
		datetime: "2024-06-01-1200",
		body: "Body content.",
		summary: "A short summary.",
		imageUrl: "https://example.com/image.png",
		readingTime: "2 min read",
	}

	it("returns the post when found", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(
			postDetail as unknown as Post
		)

		const result = await getPostBySlug("tech", "my-post")
		expect(result).toEqual(postDetail)
	})

	it("returns null when the post does not exist", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(null)

		const result = await getPostBySlug("tech", "missing-post")
		expect(result).toBeNull()
	})

	it("queries by the correct section and slug", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(null)

		await getPostBySlug("life", "some-slug")
		expect(prisma.post.findUnique).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { section_slug: { section: "life", slug: "some-slug" } },
			})
		)
	})

	it("returns null values for optional fields when they are absent", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue({
			...postDetail,
			summary: null,
			imageUrl: null,
			readingTime: null,
		} as unknown as Post)

		const result = await getPostBySlug("tech", "my-post")
		expect(result?.summary).toBeNull()
		expect(result?.imageUrl).toBeNull()
		expect(result?.readingTime).toBeNull()
	})
})

// ---------------------------------------------------------------------------
// searchPosts
// ---------------------------------------------------------------------------

/** Recursively finds the first `contains` string value in a Prisma where clause. */
function findContainsTerm(obj: unknown): string | undefined {
	if (typeof obj !== "object" || obj === null) {
		return undefined
	}

	for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
		if (key === "contains" && typeof val === "string") {
			return val
		}

		const found = findContainsTerm(val)

		if (found !== undefined) {
			return found
		}
	}

	return undefined
}

describe("searchPosts", () => {
	const posts = [
		makePost({ title: "Swift concurrency guide", body: "All about actors." }),
		makePost({ title: "SwiftUI layouts", body: "Stack views and grids." }),
		makePost({
			title: "Core Data tips",
			body: "How to use Swift in Core Data.",
		}),
		makePost({
			title: "TypeScript tricks",
			body: "Generic types and utilities.",
		}),
	]

	beforeEach(() => {
		// Simulate case-insensitive search by extracting the `contains` term from
		// wherever it appears in the where clause — agnostic to AND/OR nesting.
		vi.mocked(prisma.post.findMany).mockImplementation(async (args) => {
			const term = findContainsTerm(args?.where)?.toLowerCase()

			if (!term) {
				return posts as unknown as Post[]
			}

			return posts.filter(
				(p) =>
					p.title.toLowerCase().includes(term) ||
					p.body.toLowerCase().includes(term)
			) as unknown as Post[]
		})
	})

	it("returns posts whose title matches the query", async () => {
		const results = await searchPosts("tech", "SwiftUI")
		expect(results).toHaveLength(1)
		expect(results[0].title).toBe("SwiftUI layouts")
	})

	it("returns posts whose body matches the query", async () => {
		const results = await searchPosts("tech", "actors")
		expect(results).toHaveLength(1)
		expect(results[0].title).toBe("Swift concurrency guide")
	})

	it("is case-insensitive", async () => {
		const results = await searchPosts("tech", "TYPESCRIPT")
		expect(results).toHaveLength(1)
		expect(results[0].title).toBe("TypeScript tricks")
	})

	it("matches across both title and body in the same result set", async () => {
		// 'swift' appears in three titles/bodies
		const results = await searchPosts("tech", "swift")
		expect(results).toHaveLength(3)
	})

	it("returns an empty array when no posts match", async () => {
		const results = await searchPosts("tech", "python")
		expect(results).toHaveLength(0)
	})

	it("returns an empty array for an empty query without hitting the database", async () => {
		const results = await searchPosts("tech", "")
		expect(results).toEqual([])
		expect(prisma.post.findMany).not.toHaveBeenCalled()
	})

	it("returns an empty array for a whitespace-only query", async () => {
		const results = await searchPosts("tech", "   ")
		expect(results).toEqual([])
		expect(prisma.post.findMany).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// bySection
// ---------------------------------------------------------------------------

describe("bySection", () => {
	it("produces an entry for every known section", () => {
		const result = bySection((section) => section.toUpperCase())
		expect(result).toEqual({ tech: "TECH", life: "LIFE" })
	})

	it("calls the factory once per section", () => {
		const fn = vi.fn((section: string) => section)
		bySection(fn)
		expect(fn).toHaveBeenCalledTimes(2)
	})

	it("supports arbitrary value types", () => {
		const result = bySection(() => ({ counter: 0 }))
		expect(result.tech).toEqual({ counter: 0 })
		expect(result.life).toEqual({ counter: 0 })
		expect(result.tech).not.toBe(result.life)
	})
})

// ---------------------------------------------------------------------------
// revalidatePostSection
// ---------------------------------------------------------------------------

describe("revalidatePostSection", () => {
	beforeEach(() => {
		vi.mocked(revalidateTag).mockClear()
	})

	it("revalidates both the feed and blog tags for the section", () => {
		revalidatePostSection("tech")
		expect(revalidateTag).toHaveBeenCalledWith("feed-tech", "max")
		expect(revalidateTag).toHaveBeenCalledWith("blog-tech", "max")
	})

	it("uses the section name for the life section", () => {
		revalidatePostSection("life")
		expect(revalidateTag).toHaveBeenCalledWith("feed-life", "max")
		expect(revalidateTag).toHaveBeenCalledWith("blog-life", "max")
	})
})
