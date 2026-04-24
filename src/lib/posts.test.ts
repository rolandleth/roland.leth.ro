import { revalidateTag } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Post } from "@/generated/prisma/client"
import { prisma } from "@/lib/db"
import { PAGE_SIZE } from "@/lib/pagination"
import {
	bySection,
	getAllPublishedPostSlugs,
	getPostBySlug,
	getPostsBySection,
	getPostsGroupedByYear,
	listPostsForAdmin,
	loadPost,
	loadPostForAdmin,
	revalidatePostSection,
	searchPosts,
} from "@/lib/posts"
import { makePost } from "@/test/fixtures"

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("react", async (importOriginal) => {
	const { reactCachePassthroughFactory } =
		await import("@/test/mocks/nextCache")

	return reactCachePassthroughFactory(importOriginal)
})

vi.mock("@/lib/db", () => ({
	prisma: {
		post: {
			findMany: vi.fn(),
			findUnique: vi.fn(),
			count: vi.fn(),
		},
	},
}))

beforeEach(() => {
	vi.resetAllMocks()
})

// #region getPostsBySection

describe("getPostsBySection", () => {
	it("returns posts and totalPages for a single page of results", async () => {
		const posts = [makePost()]
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

// #endregion

// #region getPostsGroupedByYear

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

// #endregion

// #region getPostBySlug

describe("getPostBySlug", () => {
	const postDetail = {
		id: 1,
		title: "My Post",
		slug: "my-post",
		section: "tech" as const,
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

// #endregion

// #region searchPosts

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
		// The outer cast matches Prisma's PrismaPromise return, the inner `as Post[]`
		// lets us return plain fixtures without re-declaring every Post field.
		vi.mocked(prisma.post.findMany).mockImplementation(((
			args: { where?: unknown } | undefined
		) => {
			const term = findContainsTerm(args?.where)?.toLowerCase()

			if (!term) {
				return Promise.resolve(
					posts as unknown as Post[]
				) as unknown as ReturnType<typeof prisma.post.findMany>
			}

			const filtered = posts.filter(
				(p) =>
					p.title.toLowerCase().includes(term) ||
					p.body.toLowerCase().includes(term)
			)

			return Promise.resolve(
				filtered as unknown as Post[]
			) as unknown as ReturnType<typeof prisma.post.findMany>
		}) as typeof prisma.post.findMany)
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

	it("passes SQL LIKE special characters through unescaped to Prisma", async () => {
		// Prisma parameterizes `contains` under the hood; the caller must NOT
		// pre-escape `%` or `_`, or the user's literal query will be distorted.
		await searchPosts("tech", "50%_off")
		expect(prisma.post.findMany).toHaveBeenCalledOnce()

		const args = vi.mocked(prisma.post.findMany).mock.calls[0][0] as {
			where: unknown
		}
		expect(findContainsTerm(args.where)).toBe("50%_off")
	})
})

// #endregion

// #region bySection

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

// #endregion

// #region datetime future filter

describe("publishedWhere filter via getPostsBySection", () => {
	it("includes `datetime: { lte: now }` in the where clause", async () => {
		// Load-bearing for scheduled posts: removing the `lte` would make
		// future-dated drafts visible to public list views. Pin explicitly.
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await getPostsBySection("tech", 2)

		const call = vi.mocked(prisma.post.findMany).mock.calls[0][0] as {
			where: { datetime: { lte: string }; section: string; published: boolean }
		}
		expect(call.where.section).toBe("tech")
		expect(call.where.published).toBe(true)
		expect(typeof call.where.datetime.lte).toBe("string")
	})
})

// #endregion

// #region getAllPublishedPostSlugs

describe("getAllPublishedPostSlugs", () => {
	it("queries only published posts", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		await getAllPublishedPostSlugs()

		expect(prisma.post.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { published: true } })
		)
	})

	it("selects only the columns the sitemap and generateStaticParams need", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		await getAllPublishedPostSlugs()

		expect(prisma.post.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				select: {
					slug: true,
					section: true,
					datetime: true,
					updatedAt: true,
				},
			})
		)
	})

	it("orders by datetime descending", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		await getAllPublishedPostSlugs()

		expect(prisma.post.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ orderBy: { datetime: "desc" } })
		)
	})

	it("does NOT filter out future-dated posts (distinct from public list views)", async () => {
		// Sitemap/generateStaticParams want every published slug so future posts
		// can pre-render at build time. A regression that added `datetime: lte`
		// here would silently skip scheduled-but-unpublished slugs.
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		await getAllPublishedPostSlugs()

		const call = vi.mocked(prisma.post.findMany).mock.calls[0][0] as {
			where: Record<string, unknown>
		}
		expect(call.where).not.toHaveProperty("datetime")
	})
})

// #endregion

// #region loadPost / loadPostForAdmin

describe("loadPost", () => {
	it("delegates to getPostBySlug returning its result", async () => {
		const post = {
			id: 1,
			title: "P",
			slug: "s",
			section: "tech" as const,
			datetime: "2024-06-01-1200",
			body: "b",
			summary: null,
			imageUrl: null,
			readingTime: null,
		}
		vi.mocked(prisma.post.findUnique).mockResolvedValue(post as unknown as Post)

		expect(await loadPost("tech", "s")).toEqual(post)
	})
})

describe("loadPostForAdmin", () => {
	it("queries by numeric id with no tag caching", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(null)
		await loadPostForAdmin(42)

		expect(prisma.post.findUnique).toHaveBeenCalledWith({ where: { id: 42 } })
	})

	it("returns null when no matching post exists", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(null)
		expect(await loadPostForAdmin(999)).toBeNull()
	})
})

// #endregion

// #region listPostsForAdmin

describe("listPostsForAdmin", () => {
	it("paginates with skip/take derived from the page arg", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await listPostsForAdmin({ page: 3 })
		expect(prisma.post.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				skip: PAGE_SIZE * 2,
				take: PAGE_SIZE,
			})
		)
	})

	it("passes an empty where when query is undefined (list mode)", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await listPostsForAdmin({ page: 1 })
		const call = vi.mocked(prisma.post.findMany).mock.calls[0][0] as {
			where: Record<string, unknown>
		}
		expect(call.where).toEqual({})
	})

	it("treats a whitespace-only query as empty", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await listPostsForAdmin({ query: "   ", page: 1 })
		const call = vi.mocked(prisma.post.findMany).mock.calls[0][0] as {
			where: Record<string, unknown>
		}
		expect(call.where).toEqual({})
	})

	it("searches title and body when a query is provided", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await listPostsForAdmin({ query: "swift", page: 1 })
		const call = vi.mocked(prisma.post.findMany).mock.calls[0][0] as {
			where: {
				OR: [
					{ title: { contains: string; mode: string } },
					{ body: { contains: string; mode: string } },
				]
			}
		}
		expect(call.where.OR[0].title.contains).toBe("swift")
		expect(call.where.OR[1].body.contains).toBe("swift")
	})

	it("includes drafts: no `published: true` filter in either mode", async () => {
		// Admin dashboard must surface drafts alongside published posts so the
		// author can see them all in one list.
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await listPostsForAdmin({ page: 1 })
		const [list] = vi.mocked(prisma.post.findMany).mock.calls[0] as [
			{ where: Record<string, unknown> },
		]
		expect(list.where).not.toHaveProperty("published")
	})

	it("computes totalPages from the Prisma count result", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(PAGE_SIZE * 2 + 1)

		const { totalPages, totalCount } = await listPostsForAdmin({ page: 1 })
		expect(totalCount).toBe(PAGE_SIZE * 2 + 1)
		expect(totalPages).toBe(3)
	})
})

// #endregion

// #region revalidatePostSection

describe("revalidatePostSection", () => {
	beforeEach(() => {
		vi.mocked(revalidateTag).mockClear()
	})

	it("revalidates the feed, blog, and shared posts tags for the section", () => {
		revalidatePostSection("tech")
		expect(revalidateTag).toHaveBeenCalledWith("feed-tech", "max")
		expect(revalidateTag).toHaveBeenCalledWith("blog-tech", "max")
		// The shared `posts` tag is what busts the sitemap and
		// `generateStaticParams` on any post mutation — load-bearing for
		// correctness, so pin both its presence and the total call count.
		expect(revalidateTag).toHaveBeenCalledWith("posts", "max")
		expect(revalidateTag).toHaveBeenCalledTimes(3)
	})

	it("uses the section name for the life section", () => {
		revalidatePostSection("life")
		expect(revalidateTag).toHaveBeenCalledWith("feed-life", "max")
		expect(revalidateTag).toHaveBeenCalledWith("blog-life", "max")
		expect(revalidateTag).toHaveBeenCalledWith("posts", "max")
		expect(revalidateTag).toHaveBeenCalledTimes(3)
	})
})

// #endregion
