import { notFound } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getPostsBySection } from "@/lib/db/posts"
import BlogListPagedPage, {
	generateMetadata,
	generateStaticParams,
} from "./page"

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NEXT_NOT_FOUND")
	}),
}))

vi.mock("@/lib/db/posts", () => ({
	getPostsBySection: vi.fn(),
}))

vi.mock("@/components/blog/BlogPostList", () => ({
	default: () => null,
}))

function params(section: string, page: string) {
	return { params: Promise.resolve({ section, page }) }
}

beforeEach(() => {
	vi.mocked(getPostsBySection).mockResolvedValue({ posts: [], totalPages: 3 })
})

// #region Param validation

describe("BlogListPagedPage — param validation", () => {
	it("renders a valid page", async () => {
		await expect(BlogListPagedPage(params("tech", "2"))).resolves.toBeTruthy()
		expect(notFound).not.toHaveBeenCalled()
	})

	it("404s an unknown section", async () => {
		await expect(BlogListPagedPage(params("nope", "2"))).rejects.toThrow()
	})

	it.each(["1", "0", "-1"])(
		"404s page %s rather than rendering page 1",
		async (page) => {
			// `parsePageParam` clamps junk to 1. Rendering it here would serve page
			// 1's contents under a second URL, splitting it from `/blog/:section`.
			// `/p/1` is redirected to the bare path in next.config instead.
			await expect(BlogListPagedPage(params("tech", page))).rejects.toThrow()
		}
	)

	it.each(["abc", "2abc", "2.5", "", " 2"])(
		"404s the non-numeric segment %s",
		async (page) => {
			// `parsePageParam` would coerce several of these to a number and
			// silently render a page; the round-trip check rejects anything that
			// isn't exactly its own parsed form.
			await expect(BlogListPagedPage(params("tech", page))).rejects.toThrow()
		}
	)
})

// #endregion

// #region Static params

describe("generateStaticParams", () => {
	it("starts at page 2 and omits page 1", async () => {
		// Page 1 is served by `/blog/:section`; generating it here would
		// prerender a duplicate that the next.config redirect then bounces.
		vi.mocked(getPostsBySection).mockResolvedValue({ posts: [], totalPages: 3 })

		const result = await generateStaticParams()
		const techPages = result
			.filter((entry) => entry.section === "tech")
			.map((entry) => entry.page)

		expect(techPages).toEqual(["2", "3"])
	})

	it("generates nothing for a section that fits on one page", async () => {
		vi.mocked(getPostsBySection).mockResolvedValue({ posts: [], totalPages: 1 })

		expect(await generateStaticParams()).toEqual([])
	})

	it("generates nothing for an empty section", async () => {
		// `totalPages` is 0 with no posts; the length must clamp at 0 rather
		// than going negative and throwing on `Array.from`.
		vi.mocked(getPostsBySection).mockResolvedValue({ posts: [], totalPages: 0 })

		expect(await generateStaticParams()).toEqual([])
	})
})

// #endregion

// #region Metadata

describe("generateMetadata", () => {
	it("identifies the page by its own URL, not the section root", async () => {
		// Each paginated page is its own URL; reporting `/blog/tech` here would
		// make every page share one identity when shared or crawled.
		//
		// This asserts `openGraph.url` rather than a canonical because blog
		// lists deliberately don't opt into `canonicalPath` — see the warning
		// on that field in `metadata.ts`.
		const metadata = await generateMetadata(params("tech", "2"))

		expect(metadata.openGraph?.url).toBe("/blog/tech/p/2")
	})

	it("distinguishes the page in its title", async () => {
		// Two list pages with identical titles are a duplicate-content signal
		// and unhelpful in a browser history or tab strip.
		const metadata = await generateMetadata(params("tech", "2"))

		expect(metadata.title).toContain("page 2")
	})

	it("returns empty metadata for an unknown section", async () => {
		expect(await generateMetadata(params("nope", "2"))).toEqual({})
	})
})

// #endregion
