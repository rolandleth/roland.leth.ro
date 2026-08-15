import { describe, expect, it } from "vitest"
import { blogPagePath, PAGE_SIZE } from "@/lib/utils/pagination"

// #region blogPagePath

describe("blogPagePath", () => {
	it("returns the bare section path for page 1", () => {
		// Page 1 has exactly one URL. Emitting `/p/1` from an internal link
		// would send every visitor through a redirect and split the page's
		// identity across two URLs.
		expect(blogPagePath("tech", 1)).toBe("/blog/tech")
	})

	it("returns the /p/ path from page 2 onward", () => {
		expect(blogPagePath("tech", 2)).toBe("/blog/tech/p/2")
		expect(blogPagePath("life", 17)).toBe("/blog/life/p/17")
	})

	it.each([0, -1])("treats the out-of-range page %s as page 1", (page) => {
		// Defensive: `Pagination` derives neighbours arithmetically, and a
		// `/p/0` or `/p/-1` link would 404 rather than degrade to page 1.
		expect(blogPagePath("tech", page)).toBe("/blog/tech")
	})
})

// #endregion

// #region PAGE_SIZE

describe("PAGE_SIZE", () => {
	it("is a positive integer", () => {
		// Pagination arithmetic divides by this; a zero or fractional value
		// yields Infinity or non-integer page counts.
		expect(Number.isInteger(PAGE_SIZE)).toBe(true)
		expect(PAGE_SIZE).toBeGreaterThan(0)
	})
})

// #endregion
