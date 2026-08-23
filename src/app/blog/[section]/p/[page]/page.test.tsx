import { readFileSync } from "node:fs"
import { join } from "node:path"
import { notFound } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getSectionPageCount } from "@/lib/db/posts"
import { MAX_PAGE } from "@/lib/utils/format"
import { stripComments } from "@/test/sourceText"
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
	getSectionPageCount: vi.fn(),
}))

vi.mock("@/components/blog/BlogPostList", () => ({
	default: () => null,
}))

function params(section: string, page: string) {
	return { params: Promise.resolve({ section, page }) }
}

beforeEach(() => {
	// `restoreMocks` restores spies but leaves module-mock call history in place,
	// so without this a test asserting "no query ran" sees the previous test's
	// call and fails for the wrong reason.
	vi.clearAllMocks()
	vi.mocked(getSectionPageCount).mockResolvedValue(3)
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

	it.each(["abc", "2abc", "2.5", "", " 2", "02", "007"])(
		"404s the non-numeric segment %s",
		async (page) => {
			// `parsePageParam` would coerce several of these to a number and
			// silently render a page; the round-trip check rejects anything that
			// isn't exactly its own parsed form.
			await expect(BlogListPagedPage(params("tech", page))).rejects.toThrow()
		}
	)

	it("404s a page past MAX_PAGE via the clamp", async () => {
		// The boundary between the two 404 mechanisms. `parsePageParam` clamps
		// this into range, and the clamped value no longer stringifies back to
		// the raw segment — so it dies on the round-trip check, before any query.
		vi.mocked(getSectionPageCount).mockResolvedValue(3)

		await expect(BlogListPagedPage(params("tech", "999999"))).rejects.toThrow()
		expect(getSectionPageCount).not.toHaveBeenCalled()
	})

	it("logs a warning when a well-formed page number exceeds MAX_PAGE", async () => {
		// A bare notFound() can't tell "the corpus outgrew MAX_PAGE" apart from
		// "a crawler is probing junk" — this is the one rejection reason worth
		// surfacing, since the other is routine noise.
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

		await expect(BlogListPagedPage(params("tech", "999999"))).rejects.toThrow()

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("exceeds MAX_PAGE"),
			expect.objectContaining({ pageParam: "999999" })
		)
		warnSpy.mockRestore()
	})

	it("also logs the warning from generateMetadata, not just the page body", async () => {
		// `resolvePage` is shared by both — this only exercises the body above.
		// A regression that stopped `generateMetadata` from calling the shared
		// `resolvePage` (or called a divergent copy) would pass every test above
		// and still leave `generateMetadata` silent for the same URL.
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

		await generateMetadata(params("tech", "999999"))

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("exceeds MAX_PAGE"),
			expect.objectContaining({ pageParam: "999999" })
		)
		warnSpy.mockRestore()
	})

	it.each(["abc", "2abc", "2.5", "02", "007"])(
		"does not log a warning for the malformed segment %s",
		async (page) => {
			// Only a well-formed integer past MAX_PAGE is diagnostically
			// interesting — junk segments are routine crawler noise and would
			// drown the signal if logged on every probe.
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

			await expect(BlogListPagedPage(params("tech", page))).rejects.toThrow()

			expect(warnSpy).not.toHaveBeenCalled()
			warnSpy.mockRestore()
		}
	)

	it("routes resolvePage through React's per-request memo", () => {
		// The structural half of "one execution per request, not one per
		// caller": `cache()` only dedupes within an active React request scope,
		// which a unit test running `resolvePage` directly does not have (see
		// `bypassIdForRequest`'s test for the same limitation) — so the actual
		// dedup can't be asserted here. What's reachable is the regression that
		// would realistically break it: someone dropping the `cache()` wrapper,
		// which would make every out-of-range request log this page's warning
		// twice instead of once.
		//
		// Comments stripped: these are PRESENCE assertions, so a comment saying
		// `resolvePage = cache(` would satisfy them against a page that no longer
		// wraps anything — the false-pass direction, which is the one that
		// matters for a guard.
		const code = stripComments(
			readFileSync(join(__dirname, "page.tsx"), "utf8")
		)

		expect(code).toMatch(/import \{ cache \} from "react"/)
		expect(code).toMatch(/resolvePage = cache\(/)
	})

	it("404s a page inside MAX_PAGE that the section does not have", async () => {
		// The other mechanism: `29` survives parsing and the clamp, so only the
		// real page count rejects it. Without this check it was a billed render
		// of an empty list, with its own cache entry, for every probe.
		vi.mocked(getSectionPageCount).mockResolvedValue(3)

		await expect(BlogListPagedPage(params("tech", "29"))).rejects.toThrow()
	})

	it("renders the last real page", async () => {
		// The bound is inclusive — off by one here 404s a page that exists.
		vi.mocked(getSectionPageCount).mockResolvedValue(3)

		await expect(BlogListPagedPage(params("tech", "3"))).resolves.toBeTruthy()
	})

	it("reads a blog-tagged cache before 404ing an out-of-range page", async () => {
		// What lets a pinned 404 heal. `dynamicParams` stays at its default here
		// (the param set comes from the post count, not a constant), so `/p/4` on
		// a 3-page section renders on demand and CACHES the not-found result. If
		// nothing tagged were read on that path, the entry would carry no tag for
		// `revalidatePostSection` to bust and `/p/4` would keep 404ing after a
		// fourth page existed — the same stale-404 class `61929b8` fixed on the
		// detail routes.
		//
		// `getSectionPageCount` is an `unstable_cache` tagged `blog-{section}`, so
		// reading it on the 404 path is what rides the tag up onto the route
		// entry. This asserts the read happens; the propagation itself is Next's
		// and needs a real deploy to confirm.
		vi.mocked(getSectionPageCount).mockResolvedValue(3)

		await expect(BlogListPagedPage(params("tech", "4"))).rejects.toThrow()
		expect(getSectionPageCount).toHaveBeenCalledWith("tech")
	})
})

// #endregion

// #region Static params

describe("generateStaticParams", () => {
	it("starts at page 2 and omits page 1", async () => {
		// Page 1 is served by `/blog/:section`; generating it here would
		// prerender a duplicate that the next.config redirect then bounces.
		vi.mocked(getSectionPageCount).mockResolvedValue(3)

		const result = await generateStaticParams()
		const techPages = result
			.filter((entry) => entry.section === "tech")
			.map((entry) => entry.page)

		expect(techPages).toEqual(["2", "3"])
	})

	it("generates nothing for a section that fits on one page", async () => {
		vi.mocked(getSectionPageCount).mockResolvedValue(1)

		expect(await generateStaticParams()).toEqual([])
	})

	it("generates nothing for an empty section", async () => {
		// `totalPages` is 0 with no posts; the length must clamp at 0 rather
		// than going negative and throwing on `Array.from`.
		vi.mocked(getSectionPageCount).mockResolvedValue(0)

		expect(await generateStaticParams()).toEqual([])
	})

	it("counts pages without loading any post bodies", async () => {
		// This used to call `getPostsBySection`, which runs the page-1 `findMany`
		// with `postListItemSelect` — carrying `body` — plus a `count`, then threw
		// the rows away. Two full pages of markdown per build, for one integer.
		await generateStaticParams()

		expect(getSectionPageCount).toHaveBeenCalled()
	})

	it("fails the build when the corpus outgrows MAX_PAGE", async () => {
		// `resolvePage` 404s anything above `MAX_PAGE`, so a section that
		// legitimately reaches that many pages would start serving 404s for real
		// URLs with nothing to say why. Failing here makes the ceiling a build
		// error with a named fix instead of a silent production regression.
		vi.mocked(getSectionPageCount).mockResolvedValue(MAX_PAGE + 1)

		await expect(generateStaticParams()).rejects.toThrow(/MAX_PAGE/)
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

	it.each(["abc", "999999", "02", "1"])(
		"returns empty metadata for %s rather than describing page 1",
		async (page) => {
			// `generateMetadata` used the CLAMPED value with no round-trip check,
			// so every one of these produced a "page 1" title and a
			// `/blog/tech/p/1` path — for a URL the body 404s fifteen lines later.
			// Both now go through the same `resolvePage`.
			expect(await generateMetadata(params("tech", page))).toEqual({})
		}
	)

	it("returns empty metadata for a page the section does not have", async () => {
		vi.mocked(getSectionPageCount).mockResolvedValue(3)

		expect(await generateMetadata(params("tech", "29"))).toEqual({})
	})
})

// #endregion
