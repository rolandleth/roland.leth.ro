import { readFileSync } from "node:fs"
import { join } from "node:path"
import { notFound } from "next/navigation"
import { describe, expect, it, vi } from "vitest"
import { SECTIONS } from "@/lib/db/sections"
import { stripComments } from "@/test/sourceText"
import BlogListPage, {
	dynamicParams,
	generateMetadata,
	generateStaticParams,
} from "./page"

/**
 * Page 1 of the blog list had no test file at all, while being the route the
 * whole `?page=` → `/p/:page` restructure was built around.
 *
 * Two of its properties are load-bearing and invisible in the rendered output:
 * it must not reference `searchParams` (touching that API is decided at BUILD
 * time from whether the code mentions it, so one reference puts every visit on a
 * billed invocation), and `dynamicParams = false` is what makes `notFound()`
 * serve a real 404 instead of baking the 404 page as a 200.
 */

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NEXT_NOT_FOUND")
	}),
}))

vi.mock("@/components/blog/BlogPostList", () => ({
	default: () => null,
}))

function params(section: string) {
	return { params: Promise.resolve({ section }) }
}

// #region Static rendering

describe("BlogListPage — static rendering", () => {
	it("does not read searchParams", () => {
		// The point of the entire pagination restructure. `searchParams` is a
		// dynamic API, and Next decides on it from whether the module references
		// it — not per request from whether a param is present — so a single
		// mention here would move every `/blog/tech` hit onto billed compute for
		// a param that lives on `/blog/:section/p/:page` instead.
		//
		// Reads the authored source, not `String(BlogListPage)` (the transpiled
		// runtime body — type annotations stripped) or the module namespace
		// object (which can never carry a `searchParams` property regardless of
		// what the function reads, since it's a page PROP, never a module
		// export — that made the assertion this replaces incapable of failing).
		// Strips comments first — the page's own comments say the word — then
		// checks the rest, so a mention anywhere real (the `Props` type, the
		// destructure, the body) is caught regardless of which one a future
		// author reaches for. `stripComments` handles block comments and JSDoc
		// too: a line-only filter would fail this test the first time someone
		// documented the route's static-rendering constraint in a docblock,
		// which is exactly where that explanation belongs.
		const code = stripComments(
			readFileSync(join(__dirname, "page.tsx"), "utf8")
		)

		expect(code).not.toContain("searchParams")
	})

	it("turns dynamicParams off", () => {
		// `SECTIONS` is a compile-time constant, so an unknown section is always
		// a bad URL. Left at the default, an unknown one renders on demand as a
		// STATIC generation — which carries no per-request status — and the
		// `notFound()` below then bakes the 404 page as an ordinary 200. That soft
		// 404 was live in production on 2026-08-17 (`/blog/wat` returned 200).
		expect(dynamicParams).toBe(false)
	})

	it("generates every section and nothing else", () => {
		// With `dynamicParams` off, anything missing from this set 404s
		// permanently — so a section added to `SECTIONS` and not generated here
		// would be unreachable rather than merely uncached.
		expect(generateStaticParams()).toEqual(
			SECTIONS.map((section) => ({ section }))
		)
	})
})

// #endregion

// #region Param validation

describe("BlogListPage — param validation", () => {
	it.each(SECTIONS)("renders %s", async (section) => {
		await expect(BlogListPage(params(section))).resolves.toBeTruthy()
		expect(notFound).not.toHaveBeenCalled()
	})

	it("404s an unknown section", async () => {
		await expect(BlogListPage(params("nope"))).rejects.toThrow()
	})

	it("404s a section differing only by case", async () => {
		// `isValidSection` is an exact membership test, not a normalising one.
		await expect(BlogListPage(params("Tech"))).rejects.toThrow()
	})
})

// #endregion

// #region Metadata

describe("generateMetadata", () => {
	it("identifies the page by the bare section path", async () => {
		// Page 1's canonical URL is `/blog/tech`, never `/blog/tech/p/1` — the
		// other half of the contract `blogPagePath` and the `/p/1` redirect
		// enforce.
		const metadata = await generateMetadata(params("tech"))

		expect(metadata.openGraph?.url).toBe("/blog/tech")
	})

	it("does not put a page number in the title", async () => {
		// `/p/:page` appends "page N"; page 1 must not, or the two routes'
		// titles collide on what is meant to be one page.
		const metadata = await generateMetadata(params("tech"))

		expect(metadata.title).not.toContain("page")
	})

	it("advertises the section feed", async () => {
		const metadata = await generateMetadata(params("tech"))

		expect(JSON.stringify(metadata.alternates)).toContain("tech")
	})

	it("returns empty metadata for an unknown section", async () => {
		expect(await generateMetadata(params("nope"))).toEqual({})
	})
})

// #endregion
