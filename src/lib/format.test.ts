import { describe, expect, it } from "vitest"
import {
	calculateReadingTime,
	createSlug,
	currentDatetimeString,
	formatDate,
	parseIntId,
	parsePageParam,
	postDatetimeToISO,
	truncateBody,
	yearFromDatetime,
} from "@/lib/format"

// #region parseIntId

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

	it("returns null for a float string (strict integer regex)", () => {
		// `Number.parseInt("3.7", 10)` returns 3, which would let `/admin/posts/3.7/edit`
		// resolve to id=3 instead of 404. The strict regex rejects it.
		expect(parseIntId("3.7")).toBeNull()
	})

	it("returns null for trailing non-digit characters", () => {
		// Same hole as floats: `parseInt("12abc")` returns 12. Strict regex blocks.
		expect(parseIntId("12abc")).toBeNull()
	})

	it("returns null for leading non-digit characters", () => {
		expect(parseIntId("abc12")).toBeNull()
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

// #endregion

// #region parsePageParam

describe("parsePageParam", () => {
	it("parses a valid positive integer string", () => {
		expect(parsePageParam("3")).toBe(3)
	})

	it("defaults to 1 for null", () => {
		expect(parsePageParam(null)).toBe(1)
	})

	it("defaults to 1 for undefined", () => {
		expect(parsePageParam(undefined)).toBe(1)
	})

	it("defaults to 1 for non-numeric input", () => {
		expect(parsePageParam("abc")).toBe(1)
	})

	it("defaults to 1 for 0 (below minimum)", () => {
		expect(parsePageParam("0")).toBe(1)
	})

	it("defaults to 1 for a negative integer", () => {
		expect(parsePageParam("-5")).toBe(1)
	})

	it("defaults to 1 for an empty string", () => {
		expect(parsePageParam("")).toBe(1)
	})

	it("truncates floats to their integer part", () => {
		expect(parsePageParam("4.7")).toBe(4)
	})

	it("clamps overly large input to MAX_PAGE", () => {
		// `?page=999999999` would translate to a wasted Postgres OFFSET scan.
		expect(parsePageParam("999999999")).toBe(10_000)
	})
})

// #endregion

// #region postDatetimeToISO

describe("postDatetimeToISO", () => {
	it("returns an ISO string for a valid datetime", () => {
		const iso = postDatetimeToISO("2024-06-15-0930")
		expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
	})

	it("preserves the year, month, and day for a midday time", () => {
		// `new Date(y, m, d, h, min)` uses local time; midday keeps the UTC date
		// on the same calendar day across every reasonable zone.
		const iso = postDatetimeToISO("2025-01-02-1200")
		expect(iso?.slice(0, 10)).toBe("2025-01-02")
	})

	it("returns undefined for a malformed datetime", () => {
		expect(postDatetimeToISO("not-a-date")).toBeUndefined()
	})

	it("returns undefined for an empty string", () => {
		expect(postDatetimeToISO("")).toBeUndefined()
	})

	it("returns undefined when a valid date is embedded with trailing garbage", () => {
		// Anchored regex: a leading match must consume the whole string, so
		// `"2024-06-15-0930 extra"` is rejected instead of silently parsing.
		expect(postDatetimeToISO("2024-06-15-0930 extra")).toBeUndefined()
	})

	it("returns undefined when a valid date is embedded with leading garbage", () => {
		expect(postDatetimeToISO("prefix-2024-06-15-0930")).toBeUndefined()
	})
})

// #endregion

// #region yearFromDatetime

describe("yearFromDatetime", () => {
	it("extracts the 4-digit year from a valid datetime", () => {
		expect(yearFromDatetime("2024-06-15-0930")).toBe("2024")
	})

	it("returns the first 4 characters regardless of trailing content", () => {
		expect(yearFromDatetime("1999-xx")).toBe("1999")
	})
})

// #endregion

// #region formatDate

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

// #endregion

// #region currentDatetimeString

describe("currentDatetimeString", () => {
	it("returns a string matching the yyyy-MM-dd-HHmm format", () => {
		expect(currentDatetimeString()).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}$/)
	})

	it("starts with the current year", () => {
		const year = new Date().getFullYear().toString()
		expect(currentDatetimeString().startsWith(year)).toBe(true)
	})
})

// #endregion

// #region createSlug

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

	it("returns an empty string for empty input", () => {
		// Insertion path relies on `slug` being a non-empty string (Prisma NOT
		// NULL). Current behaviour is silent "", which would produce a confusing
		// constraint error at insert time. Test pins the current shape so a
		// future guard / fallback is an explicit decision.
		expect(createSlug("")).toBe("")
	})

	it("returns an empty string when every character is stripped", () => {
		// All punctuation characters listed in the regex strip away, so the
		// result is "". Same NOT NULL concern as empty input.
		expect(createSlug("!!!???")).toBe("")
	})

	it("returns an empty string for whitespace-only input", () => {
		// Whitespace collapses to a single `-`, then leading/trailing trim drops it.
		expect(createSlug("   ")).toBe("")
	})

	it("strips accents (é → e)", () => {
		expect(createSlug("Café au lait")).toBe("cafe-au-lait")
	})

	it("strips combining marks (à → a, ñ → n)", () => {
		expect(createSlug("Año Nuevo")).toBe("ano-nuevo")
	})

	it("collapses an em-dash with surrounding spaces into a single hyphen", () => {
		expect(createSlug("Hello — World")).toBe("hello-world")
	})

	it("folds U+2212 minus and soft hyphen into the dash class", () => {
		// Pre-fix these characters passed `\s.‐-―` and survived to the slug,
		// producing technically-valid-but-weird URLs like `/blog/tech/−−−`.
		expect(createSlug("Hello − World")).toBe("hello-world")
		expect(createSlug("Hello ­ World")).toBe("hello-world")
		// All-minus / all-soft-hyphen titles reduce to empty after collapse +
		// trim — paired with the `producesNonEmptySlug` schema refine, the
		// admin form rejects them with a clean 400.
		expect(createSlug("−−−")).toBe("")
		expect(createSlug("­­­")).toBe("")
	})

	it("collapses repeated hyphens", () => {
		expect(createSlug("foo---bar")).toBe("foo-bar")
	})

	it("trims leading and trailing hyphens", () => {
		expect(createSlug("---hello---")).toBe("hello")
	})
})

// #endregion

// #region calculateReadingTime

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

// #endregion

// #region truncateBody

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

// #endregion
