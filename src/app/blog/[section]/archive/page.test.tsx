import { notFound } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getPostsGroupedByYear } from "@/lib/db/posts"
import { SECTIONS } from "@/lib/db/sections"
import ArchivePage, {
	dynamicParams,
	generateMetadata,
	generateStaticParams,
} from "./page"

/**
 * The archive is the one route left with both a sibling `loading.tsx` and a
 * `notFound()`, held safe only by `dynamicParams = false` — everywhere else that
 * shape was fixed by deleting the loading skeleton instead. `loadingBoundaries.test.ts`
 * deliberately whitelists archive out of its walk, so this line had zero coverage:
 * deleting it would reinstate the 2026-08-17 soft-404 with a fully green suite.
 * Mirrors `(list)/page.test.tsx`, which asserts the identical contract for its sibling.
 */

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NEXT_NOT_FOUND")
	}),
}))

vi.mock("@/lib/db/posts", () => ({
	getPostsGroupedByYear: vi.fn(),
}))

function params(section: string) {
	return { params: Promise.resolve({ section }) }
}

beforeEach(() => {
	vi.clearAllMocks()
	vi.mocked(getPostsGroupedByYear).mockResolvedValue({})
})

// #region Static rendering

describe("ArchivePage — static rendering", () => {
	it("turns dynamicParams off", () => {
		// `SECTIONS` is a compile-time constant, so an unknown section is always a
		// bad URL. Left at the default, an unknown one renders on demand as a
		// STATIC generation — which carries no per-request status — and the
		// `notFound()` below then bakes the 404 page as an ordinary 200.
		expect(dynamicParams).toBe(false)
	})

	it("generates every section and nothing else", () => {
		expect(generateStaticParams()).toEqual(
			SECTIONS.map((section) => ({ section }))
		)
	})
})

// #endregion

// #region Param validation

describe("ArchivePage — param validation", () => {
	it.each(SECTIONS)("renders %s", async (section) => {
		await expect(ArchivePage(params(section))).resolves.toBeTruthy()
		expect(notFound).not.toHaveBeenCalled()
	})

	it("404s an unknown section", async () => {
		await expect(ArchivePage(params("nope"))).rejects.toThrow()
	})

	it("404s a section differing only by case", async () => {
		// `isValidSection` is an exact membership test, not a normalising one.
		await expect(ArchivePage(params("Tech"))).rejects.toThrow()
	})
})

// #endregion

// #region Metadata

describe("generateMetadata", () => {
	it("identifies the page as the section archive", async () => {
		const metadata = await generateMetadata(params("tech"))

		expect(metadata.openGraph?.url).toBe("/blog/tech/archive")
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
