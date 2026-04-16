import { describe, expect, it } from "vitest"
import {
	calculateReadingTime,
	createSlug,
	currentDatetimeString,
	formatDate,
	parseIntId,
	truncateBody,
} from "@/lib/format"

// ---------------------------------------------------------------------------
// parseIntId
// ---------------------------------------------------------------------------

describe("parseIntId", () => {
	it("parses a valid positive integer", () => {
		expect(parseIntId("42")).toBe(42)
	})

	it("parses zero", () => {
		expect(parseIntId("0")).toBe(0)
	})

	it("parses a negative integer", () => {
		expect(parseIntId("-5")).toBe(-5)
	})

	it("truncates a float string to its integer part", () => {
		expect(parseIntId("3.7")).toBe(3)
	})

	it("returns null for a non-numeric string", () => {
		expect(parseIntId("abc")).toBeNull()
	})

	it("returns null for an empty string", () => {
		expect(parseIntId("")).toBeNull()
	})

	it("returns null for whitespace", () => {
		expect(parseIntId(" ")).toBeNull()
	})
})

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe("formatDate", () => {
	it("formats a mid-year date", () => {
		expect(formatDate("2025-01-15-0930")).toBe("Jan 15, 2025")
	})

	it("formats a year-end date", () => {
		expect(formatDate("2024-12-31-2359")).toBe("Dec 31, 2024")
	})

	it("formats a leap-day date", () => {
		expect(formatDate("2024-02-29-1200")).toBe("Feb 29, 2024")
	})

	it("returns the raw string when no date pattern matches", () => {
		expect(formatDate("invalid")).toBe("invalid")
	})

	it("returns the raw string for an empty string", () => {
		expect(formatDate("")).toBe("")
	})
})

// ---------------------------------------------------------------------------
// currentDatetimeString
// ---------------------------------------------------------------------------

describe("currentDatetimeString", () => {
	it("returns a string matching the yyyy-MM-dd-HHmm format", () => {
		expect(currentDatetimeString()).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}$/)
	})

	it("starts with the current year", () => {
		const year = new Date().getFullYear().toString()
		expect(currentDatetimeString().startsWith(year)).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// createSlug
// ---------------------------------------------------------------------------

describe("createSlug", () => {
	it("lowercases the title", () => {
		expect(createSlug("Hello World")).toBe("hello-world")
	})

	it("replaces spaces with hyphens", () => {
		expect(createSlug("foo bar baz")).toBe("foo-bar-baz")
	})

	it("replaces dots with hyphens", () => {
		expect(createSlug("v1.2.3")).toBe("v1-2-3")
	})

	it("replaces & with 'and'", () => {
		expect(createSlug("design & code")).toBe("design-and-code")
	})

	it("removes single quotes", () => {
		expect(createSlug("don't stop")).toBe("dont-stop")
	})

	it("removes double quotes", () => {
		expect(createSlug('"quoted title"')).toBe("quoted-title")
	})

	it("removes hash characters", () => {
		expect(createSlug("C# programming")).toBe("c-programming")
	})

	it("removes slashes", () => {
		expect(createSlug("async/await")).toBe("asyncawait")
	})

	it("removes parentheses", () => {
		expect(createSlug("foo (bar)")).toBe("foo-bar")
	})

	it("removes question marks", () => {
		expect(createSlug("what now?")).toBe("what-now")
	})

	it("removes exclamation marks", () => {
		expect(createSlug("wow!")).toBe("wow")
	})

	it("handles already-clean slugs", () => {
		expect(createSlug("my-post")).toBe("my-post")
	})

	it("handles complex real-world titles", () => {
		expect(createSlug("Swift's new async/await: What's next?")).toBe(
			"swifts-new-asyncawait-whats-next"
		)
	})
})

// ---------------------------------------------------------------------------
// calculateReadingTime
// ---------------------------------------------------------------------------

// reading-time uses ~200 wpm:
//   <40 words  → <0.2 min → ""
//   ~70 words  → ~0.35 min → "25 sec read"
//   ~130 words → ~0.65 min → "45 sec read"
//   ~400 words → ~2 min   → "2 min read"
const words = (n: number) => Array(n).fill("word").join(" ")

describe("calculateReadingTime", () => {
	it("returns empty string for very short text", () => {
		expect(calculateReadingTime("hi")).toBe("")
	})

	it("returns '25 sec read' for a short read", () => {
		expect(calculateReadingTime(words(70))).toBe("25 sec read")
	})

	it("returns '45 sec read' for a medium-short read", () => {
		expect(calculateReadingTime(words(130))).toBe("45 sec read")
	})

	it("returns a standard minute-based string for longer content", () => {
		expect(calculateReadingTime(words(400))).toBe("2 min read")
	})
})

// ---------------------------------------------------------------------------
// truncateBody
// ---------------------------------------------------------------------------

describe("truncateBody", () => {
	it("returns body unchanged when under 900 chars", () => {
		const body = "Short body content."
		expect(truncateBody(body)).toEqual({ text: body, isTruncated: false })
	})

	it("returns body unchanged at exactly 899 chars", () => {
		const body = "a".repeat(899)
		expect(truncateBody(body)).toEqual({ text: body, isTruncated: false })
	})

	it("truncates at a paragraph break near 700 chars", () => {
		// first paragraph ends before 700, second paragraph pushes total > 900
		const firstPara = "a".repeat(500)
		const secondPara = "b".repeat(600)
		const body = `${firstPara}\n\n${secondPara}`
		const { text, isTruncated } = truncateBody(body)
		expect(isTruncated).toBe(true)
		expect(text).toBe(firstPara)
	})

	it("truncates at 700 chars when no paragraph break exists before 700", () => {
		const body = "a".repeat(1000)
		const { text, isTruncated } = truncateBody(body)
		expect(isTruncated).toBe(true)
		expect(text).toBe("a".repeat(700))
	})

	it("trims before a heading that appears before the cut point", () => {
		// intro → heading → content; total > 900; heading falls within first 700
		const intro = "a".repeat(400)
		const heading = "\n\n## Section Heading\n\n"
		const content = "b".repeat(700)
		const body = intro + heading + content
		const { text, isTruncated } = truncateBody(body)
		expect(isTruncated).toBe(true)
		// excerpt should stop before the heading
		expect(text).toBe(intro)
	})
})
