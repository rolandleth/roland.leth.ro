import { revalidateTag, unstable_cache } from "next/cache"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Post } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/db"
import {
	bySection,
	findPostsBecameLive,
	feedTag,
	getAllPublishedPostSlugs,
	getPostBySlug,
	getPostsBySection,
	getPostsGroupedByYear,
	listPostsForAdmin,
	loadPostForAdmin,
	loadPostResolution,
	loadPostRowResolution,
	revalidatePostDetails,
	revalidatePostSection,
	searchPosts,
} from "@/lib/db/posts"
import { PAGE_SIZE } from "@/lib/utils/pagination"
import { makePost } from "@/test/fixtures"

// Spy variant so the `keys` / `tags` wired into each per-(section, page) cache
// wrapper can be asserted. Behaves identically to the passthrough factory for
// the wrapped function itself.
vi.mock("next/cache", async () => {
	const { nextCacheSpyFactory } = await import("@/test/mocks/nextCache")

	return nextCacheSpyFactory()
})

vi.mock("react", async (importOriginal) => {
	const { reactCachePassthroughFactory } =
		await import("@/test/mocks/nextCache")

	return reactCachePassthroughFactory(importOriginal)
})

vi.mock("@/lib/db/db", () => ({
	prisma: {
		post: {
			findMany: vi.fn(),
			findUnique: vi.fn(),
			findFirst: vi.fn(),
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

	it("takes exactly PAGE_SIZE with no skip on page 1", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await getPostsBySection("tech", 1)

		expect(prisma.post.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ skip: 0, take: PAGE_SIZE })
		)
	})

	it("does not pad the page size by the scheduled-post count", async () => {
		// The previous design over-fetched `PAGE_SIZE + futureCount` rows so a
		// read-time filter could strip scheduled posts and still slice a full
		// page. That only worked while the route rendered per request; it's
		// prerendered now, so the filter happens in SQL and the window is exact.
		// Padding here would silently drop the last N posts of every page.
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(2)

		await getPostsBySection("tech", 1)

		expect(prisma.post.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ take: PAGE_SIZE })
		)
	})

	it("excludes scheduled posts in SQL rather than after the query", async () => {
		// Filtering in SQL is what keeps page boundaries at exact multiples of
		// PAGE_SIZE. Future-dated posts sort to the head of a `datetime desc`
		// list, so filtering after `skip` would shift every boundary by the
		// scheduled-post count and duplicate or drop posts across pages.
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await getPostsBySection("tech", 2)

		const where = vi.mocked(prisma.post.findMany).mock.calls[0][0]?.where

		expect(where).toMatchObject({
			section: "tech",
			published: true,
			datetime: { lte: expect.stringMatching(/^\d{4}-\d{2}-\d{2}-\d{4}$/) },
		})
	})

	it("returns whatever the query returned, without post-filtering", async () => {
		// The route renders exactly the rows SQL selected. A stray read-time
		// filter would re-introduce the page-boundary shift above.
		vi.mocked(prisma.post.count).mockResolvedValue(2)
		const posts = [
			makePost({ slug: "one", datetime: "2024-06-01-1200" }),
			makePost({ slug: "two", datetime: "2024-05-01-1200" }),
		]
		vi.mocked(prisma.post.findMany).mockResolvedValue(
			posts as unknown as Post[]
		)

		const result = await getPostsBySection("tech", 1)

		expect(result.posts.map((p) => p.slug)).toEqual(["one", "two"])
	})

	it("counts total pages from live posts only", async () => {
		// `totalPages` and the page window must agree on which posts are live,
		// or the last page renders empty and 404s.
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(25)

		const { totalPages } = await getPostsBySection("tech", 1)

		const countWhere = vi.mocked(prisma.post.count).mock.calls[0][0]?.where

		expect(totalPages).toBe(3)
		expect(countWhere).toMatchObject({
			published: true,
			datetime: { lte: expect.any(String) },
		})
	})

	// Wrappers are memoized per (section, page) for the LIFETIME OF THE MODULE,
	// so these use page numbers no other test touches — otherwise the wrapper
	// already exists and `unstable_cache` is never called again, and the test
	// passes vacuously with zero calls to inspect.
	//
	// 91-93 are reserved for this block. Reusing one below silently breaks these
	// rather than failing the new test, so pick fresh numbers if you need more.
	it("scopes the cache tag to the section", async () => {
		// Busting `blog-tech` must not clear life's pages, and the cron busts
		// per section. A shared tag would make every publish regenerate both.
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await getPostsBySection("life", 91)

		expect(unstable_cache).toHaveBeenCalledWith(
			expect.any(Function),
			expect.any(Array),
			{ tags: ["blog-life"] }
		)
	})

	it("gives each page its own cache key", async () => {
		// One entry per (section, page). A shared key would make page 2 serve
		// page 1's rows, or thrash a single entry between them.
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await getPostsBySection("tech", 92)
		await getPostsBySection("tech", 93)

		const keys = vi
			.mocked(unstable_cache)
			.mock.calls.map((call) => (call[1] ?? []).join())

		// Uniqueness alone would pass on keys that merely differ, including two
		// that encode the section and not the page. The page number has to BE in
		// the key, which is what makes the entries addressable.
		expect(keys).toContain("blog-page-tech-92")
		expect(keys).toContain("blog-page-tech-93")
		expect(new Set(keys).size).toBe(keys.length)
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

// #region getSectionPageCount

describe("getSectionPageCount", () => {
	it("scopes the cache tag to the section", async () => {
		// Unlike the per-page cache above, `sectionPageCountCache` is built once
		// per section at module load (`bySection(makeSectionPageCountCache)`),
		// not lazily per call — so the `unstable_cache` call that tags it already
		// happened before this test's `beforeEach` could clear it. Re-importing
		// fresh replays that module-init call where it's observable.
		vi.resetModules()
		const fresh = await import("@/lib/db/posts")
		vi.mocked(prisma.post.count).mockResolvedValue(0)

		await fresh.getSectionPageCount("tech")

		// Same tag `getPostsBySection` uses and `revalidatePostSection` busts
		// (see "revalidates the feed, blog, and shared posts tags" below) — this
		// is the string-level half of the drift class the 2026-07 stale-404
		// incident came from.
		expect(unstable_cache).toHaveBeenCalledWith(
			expect.any(Function),
			["blog-page-count-tech"],
			{ tags: ["blog-tech"] }
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

	it("filters future-dated rows out of the year groups at read time", async () => {
		// Cache stores scheduled rows so they auto-surface in the archive
		// once their `datetime` passes; the read-time filter excludes them
		// from the year groups in the meantime.
		const posts = [
			makePost({ datetime: "2024-06-20-1400", title: "Live" }),
			makePost({ datetime: "9999-12-31-2359", title: "Scheduled" }),
		]
		vi.mocked(prisma.post.findMany).mockResolvedValue(
			posts as unknown as Post[]
		)

		const groups = await getPostsGroupedByYear("tech")
		expect(Object.keys(groups)).toEqual(["2024"])
		expect(groups["2024"]).toHaveLength(1)
		expect(groups["2024"][0].title).toBe("Live")
	})

	it("tags the cache with both the archive tag and the shared section tag", async () => {
		// `archiveCache` is built once per section at module load
		// (`bySection(makeArchiveCache)`), not lazily per call — same situation
		// as `sectionPageCountCache`, so the `unstable_cache` call that tags it
		// already happened before this test's `beforeEach` could clear it.
		// Re-importing fresh replays that module-init call where it's observable.
		//
		// Both tags matter: `blog-archive-tech` is this cache's own key, and
		// `blog-tech` (via `sectionTag`) is what rides the archive onto every
		// other post-mutation bust — without it, `revalidatePostSection` would
		// refresh the list pages while leaving a stale archive behind.
		vi.resetModules()
		const fresh = await import("@/lib/db/posts")
		vi.mocked(prisma.post.findMany).mockResolvedValue([])

		await fresh.getPostsGroupedByYear("tech")

		expect(unstable_cache).toHaveBeenCalledWith(
			expect.any(Function),
			["blog-archive-tech"],
			{ tags: ["blog-archive-tech", "blog-tech"] }
		)
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
		vi.mocked(prisma.post.findFirst).mockResolvedValue(
			postDetail as unknown as Post
		)

		const result = await getPostBySlug("tech", "my-post")
		expect(result).toEqual(postDetail)
	})

	it("returns null when the post does not exist", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue(null)

		const result = await getPostBySlug("tech", "missing-post")
		expect(result).toBeNull()
	})

	it("filters drafts at the query boundary via `published: true`", async () => {
		// Drafts are server-side filtered so the canonical URL never serves an
		// unpublished row. Future-dated posts are NOT filtered here; the
		// boundary is enforced at read time so scheduled posts auto-surface
		// the first request after their `datetime` passes.
		vi.mocked(prisma.post.findFirst).mockResolvedValue(null)

		await getPostBySlug("life", "some-slug")

		const call = vi.mocked(prisma.post.findFirst).mock.calls[0][0] as {
			where: Record<string, unknown>
		}
		expect(call.where.section).toBe("life")
		expect(call.where.slug).toBe("some-slug")
		expect(call.where.published).toBe(true)
		expect(call.where).not.toHaveProperty("datetime")
	})

	it("returns null for a future-dated row (read-time filter)", async () => {
		// The cached row exists so it can auto-surface as its `datetime`
		// passes, but the read-time check keeps the canonical URL 404ing
		// until then.
		vi.mocked(prisma.post.findFirst).mockResolvedValue({
			...postDetail,
			datetime: "9999-12-31-2359",
		} as unknown as Post)

		const result = await getPostBySlug("tech", "scheduled")
		expect(result).toBeNull()
	})

	it("returns null when the row doesn't exist", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue(null)

		const result = await getPostBySlug("tech", "scheduled-draft")
		expect(result).toBeNull()
	})

	it("returns null values for optional fields when they are absent", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue({
			...postDetail,
			imageUrl: null,
			readingTime: null,
		} as unknown as Post)

		const result = await getPostBySlug("tech", "my-post")
		expect(result?.imageUrl).toBeNull()
		expect(result?.readingTime).toBeNull()
	})
})

// #endregion

// #region loadPostResolution

describe("loadPostResolution", () => {
	const scheduledDetail = {
		id: 1,
		title: "My Post",
		slug: "my-post",
		section: "tech" as const,
		datetime: "9999-12-31-2359",
		body: "Body content.",
		summary: "A short summary.",
		imageUrl: null,
		readingTime: null,
	}

	it("resolves a future-dated row as scheduled, teaser fields only", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue(
			scheduledDetail as unknown as Post
		)

		const result = await loadPostResolution("tech", "my-post")

		expect(result).toEqual({
			status: "scheduled",
			scheduled: { title: "My Post", datetime: "9999-12-31-2359" },
		})
	})

	it("resolves an already-live row as live, carrying the whole row", async () => {
		const live = { ...scheduledDetail, datetime: "2024-06-01-1200" }
		vi.mocked(prisma.post.findFirst).mockResolvedValue(live as unknown as Post)

		const result = await loadPostResolution("tech", "my-post")

		expect(result).toEqual({ status: "live", post: live })
	})

	it("resolves a row that does not exist as missing", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue(null)

		const result = await loadPostResolution("tech", "missing-post")

		expect(result).toEqual({ status: "missing" })
	})

	it("keeps drafts invisible via the same `published: true` boundary", async () => {
		// A future-dated DRAFT must not tease its title: the query boundary
		// filters `published: true` before the datetime comparison ever runs.
		vi.mocked(prisma.post.findFirst).mockResolvedValue(null)

		await loadPostResolution("life", "some-slug")

		const call = vi.mocked(prisma.post.findFirst).mock.calls[0][0] as {
			where: Record<string, unknown>
		}
		expect(call.where.published).toBe(true)
	})

	// `live` and `scheduled` have to stay exact complements: the minute a post
	// comes due must land on one of them and never on neither. "Neither" is what
	// falls through to `notFound()` and pins a 404 on a post at the moment it
	// goes live, which is the failure the single-clock-read resolver exists to
	// rule out.
	describe("at the exact publish minute", () => {
		beforeEach(() => {
			vi.useFakeTimers()
			vi.setSystemTime(new Date(2026, 8, 4, 9, 0, 0))
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		it("resolves live when `datetime` equals now to the minute", async () => {
			vi.mocked(prisma.post.findFirst).mockResolvedValue({
				...scheduledDetail,
				datetime: "2026-09-04-0900",
			} as unknown as Post)

			const result = await loadPostResolution("tech", "my-post")

			expect(result.status).toBe("live")
		})

		it("resolves scheduled for the minute before it comes due", async () => {
			vi.mocked(prisma.post.findFirst).mockResolvedValue({
				...scheduledDetail,
				datetime: "2026-09-04-0901",
			} as unknown as Post)

			const result = await loadPostResolution("tech", "my-post")

			expect(result.status).toBe("scheduled")
		})
	})
})

// #endregion

// #region loadPostRowResolution

describe("loadPostRowResolution", () => {
	const scheduledDetail = {
		id: 1,
		title: "My Post",
		slug: "my-post",
		section: "tech" as const,
		datetime: "9999-12-31-2359",
		body: "Body content.",
		summary: "A short summary.",
		imageUrl: null,
		readingTime: null,
	}

	it("carries the body on the scheduled branch, which the teaser withholds", async () => {
		// The whole reason the override-preview route reads this accessor rather
		// than `loadPostResolution`.
		vi.mocked(prisma.post.findFirst).mockResolvedValue(
			scheduledDetail as unknown as Post
		)

		const result = await loadPostRowResolution("tech", "my-post")

		expect(result).toEqual({ status: "scheduled", post: scheduledDetail })
	})

	it("reaches the same live/scheduled verdict as the narrowed resolver", async () => {
		// The two share one clock read by construction; this pins that they stay
		// the same function, so a preview can't disagree with the public page
		// about whether a post is out.
		const live = { ...scheduledDetail, datetime: "2024-06-01-1200" }
		vi.mocked(prisma.post.findFirst).mockResolvedValue(live as unknown as Post)

		const [narrowed, row] = await Promise.all([
			loadPostResolution("tech", "my-post"),
			loadPostRowResolution("tech", "my-post"),
		])

		expect(row.status).toBe(narrowed.status)
		expect(row).toEqual({ status: "live", post: live })
	})

	it("resolves a row that does not exist as missing", async () => {
		vi.mocked(prisma.post.findFirst).mockResolvedValue(null)

		const result = await loadPostRowResolution("tech", "missing-post")

		expect(result).toEqual({ status: "missing" })
	})

	it("keeps drafts invisible via the same `published: true` boundary", async () => {
		// The preview route is public, so this query boundary is the whole of
		// what stands between a guessed URL and a draft: it excludes unpublished
		// rows before the datetime comparison runs, so overriding the schedule
		// can't also override the draft flag.
		vi.mocked(prisma.post.findFirst).mockResolvedValue(null)

		await loadPostRowResolution("life", "some-slug")

		const call = vi.mocked(prisma.post.findFirst).mock.calls[0][0] as {
			where: Record<string, unknown>
		}

		expect(call.where.published).toBe(true)
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

	it.each([
		[
			"returns posts whose title matches the query",
			"SwiftUI",
			"SwiftUI layouts",
		],
		[
			"returns posts whose body matches the query",
			"actors",
			"Swift concurrency guide",
		],
		["is case-insensitive", "TYPESCRIPT", "TypeScript tricks"],
	])("%s", async (_label, query, expectedTitle) => {
		const results = await searchPosts("tech", query)
		expect(results).toHaveLength(1)
		expect(results[0].title).toBe(expectedTitle)
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
	it("includes `datetime: { lte: now }` in the where clause for page > 1", async () => {
		// Page > 1 is uncached and queries the DB directly, so the `lte`
		// filter belongs in the where clause. Page 1 uses a different shape
		// (cache including future, filter at read time); covered separately.
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
	it("queries every published post (including scheduled) so the read-time filter can surface them", async () => {
		// `datetime <= now` is NOT in the where clause — the filter is applied
		// after the cache returns so scheduled posts auto-surface in the
		// sitemap / `generateStaticParams` once their `datetime` passes.
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		await getAllPublishedPostSlugs()

		const call = vi.mocked(prisma.post.findMany).mock.calls[0][0] as {
			where: Record<string, unknown>
		}
		expect(call.where.published).toBe(true)
		expect(call.where).not.toHaveProperty("datetime")
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

	it("filters future-dated posts at read time so the sitemap mirrors public listings", async () => {
		// Without this filter, search engines would crawl scheduled posts
		// before their publish time and `generateStaticParams` would prerender
		// them. With it, scheduled rows stay cached but stay out of the
		// sitemap until their `datetime` passes.
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			{
				slug: "live",
				section: "tech",
				datetime: "2024-06-01-1200",
				updatedAt: new Date("2024-06-01"),
			},
			{
				slug: "scheduled",
				section: "tech",
				datetime: "9999-12-31-2359",
				updatedAt: new Date("2024-06-01"),
			},
		] as unknown as Post[])

		const slugs = await getAllPublishedPostSlugs()
		expect(slugs.map((s) => s.slug)).toEqual(["live"])
	})
})

// #endregion

// #region loadPostForAdmin

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

	it("builds the section-scoped feed cache tag", () => {
		// The bust above and the feed route's `unstable_cache` entry have to
		// agree on this exact string, which is why it's a shared function rather
		// than a literal in each — pinned directly so the helper keeps its own
		// assertion, not just the one it happens to satisfy above.
		expect(feedTag("tech")).toBe("feed-tech")
		expect(feedTag("life")).toBe("feed-life")
	})
})

// #endregion

// #region findPostsBecameLive

describe("findPostsBecameLive", () => {
	it("returns only published posts inside the window", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			{ section: "tech", slug: "one" },
			{ section: "life", slug: "two" },
		] as never)

		const result = await findPostsBecameLive(
			"2026-08-15-0800",
			"2026-08-15-1000",
			50
		)

		expect(result).toEqual([
			{ section: "tech", slug: "one" },
			{ section: "life", slug: "two" },
		])
		expect(prisma.post.findMany).toHaveBeenCalledWith({
			where: {
				published: true,
				datetime: { gt: "2026-08-15-0800", lte: "2026-08-15-1000" },
			},
			select: { section: true, slug: true },
			take: 50,
		})
	})

	it("bounds the result with the caller's limit", async () => {
		// Unbounded, a bulk import of backdated posts landing inside one window
		// loads every row so the cron can fire one `revalidateTag` each. The cap
		// is what makes that path's cost finite.
		vi.mocked(prisma.post.findMany).mockResolvedValue([] as never)

		await findPostsBecameLive("2026-08-15-0800", "2026-08-15-1000", 7)

		expect(vi.mocked(prisma.post.findMany).mock.calls[0][0]?.take).toBe(7)
	})

	it("selects the identity the caller needs to bust a detail tag", async () => {
		// `postTag` keys on (section, slug). Dropping either from the select would
		// leave the cron able to see that something came due but not which detail
		// entry to regenerate — the gap that let a scheduled post's own URL keep
		// serving a pinned 404.
		vi.mocked(prisma.post.findMany).mockResolvedValue([] as never)

		await findPostsBecameLive("2026-08-15-0800", "2026-08-15-1000", 50)

		const select = vi.mocked(prisma.post.findMany).mock.calls[0][0]?.select

		expect(select).toEqual({ section: true, slug: true })
	})

	it("excludes the lower bound and includes the upper", async () => {
		// Half-open on purpose: consecutive cron runs share a boundary instant,
		// and an inclusive lower bound would re-report the same post every run,
		// busting the caches this route exists to stop busting.
		vi.mocked(prisma.post.findMany).mockResolvedValue([] as never)

		await findPostsBecameLive("2026-08-15-0800", "2026-08-15-1000", 50)

		const where = vi.mocked(prisma.post.findMany).mock.calls[0][0]?.where

		expect(where?.datetime).toEqual({
			gt: "2026-08-15-0800",
			lte: "2026-08-15-1000",
		})
	})

	it("does not filter by section", async () => {
		// The sitemap and the `posts` aggregate span sections, so the caller
		// busts all sections on any hit — narrowing here would be misleading.
		vi.mocked(prisma.post.findMany).mockResolvedValue([] as never)

		await findPostsBecameLive("2026-08-15-0800", "2026-08-15-1000", 50)

		const where = vi.mocked(prisma.post.findMany).mock.calls[0][0]?.where

		expect(where).not.toHaveProperty("section")
	})
})

// #endregion

// #region revalidatePostDetails

describe("revalidatePostDetails", () => {
	it("busts each due post's own detail tag and nothing else", async () => {
		// The section aggregates are the caller's job. This one exists solely to
		// reach the per-post detail entries — the page and the `.md` route — which
		// `revalidatePostSection` has never touched.
		const { revalidateTag } = await import("next/cache")

		vi.mocked(revalidateTag).mockClear()

		revalidatePostDetails([
			{ section: "tech", slug: "one" },
			{ section: "life", slug: "two" },
		])

		expect(vi.mocked(revalidateTag).mock.calls.map((call) => call[0])).toEqual([
			"post-tech-one",
			"post-life-two",
		])
	})

	it("does nothing for an empty list", async () => {
		const { revalidateTag } = await import("next/cache")

		vi.mocked(revalidateTag).mockClear()

		revalidatePostDetails([])

		expect(revalidateTag).not.toHaveBeenCalled()
	})
})

// #endregion
