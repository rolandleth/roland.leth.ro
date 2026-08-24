import { describe, expect, it } from "vitest"
import {
	blankToNull,
	calculateReadingTime,
	createSlug,
	currentDatetimeString,
	datetimeToUtcDate,
	formatDate,
	formatDateValue,
	MAX_PAGE,
	MAX_SAFE_ADMIN_PAGE,
	parseAdminPageParam,
	parseIntId,
	parsePageParam,
	postDatetimeToISO,
	yearFromDatetime,
} from "@/lib/utils/format"
import { PAGE_SIZE } from "@/lib/utils/pagination"

// #region blankToNull

describe("blankToNull", () => {
	it.each([
		["empty", ""],
		["single space", " "],
		["whitespace run", "   "],
		["tab and newline", "\t\n"],
	])("collapses a %s string to null", (_label, value) => {
		expect(blankToNull(value)).toBeNull()
	})

	it.each([
		["null", null],
		["undefined", undefined],
	])("passes %s through as null", (_label, value) => {
		expect(blankToNull(value)).toBeNull()
	})

	it("trims a padded value rather than rejecting it", () => {
		expect(blankToNull("  /images/a.png  ")).toBe("/images/a.png")
	})

	it("returns a non-blank value unchanged", () => {
		expect(blankToNull("/images/a.png")).toBe("/images/a.png")
	})
})

// #endregion

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
		// The clamp is what lets a route reject out-of-range in the same
		// round-trip comparison it uses for junk: the clamped value no longer
		// stringifies back to the raw segment, so `/p/999999999` 404s before any
		// query runs.
		expect(parsePageParam("999999999")).toBe(MAX_PAGE)
	})

	it("bounds the probe surface to a few hundred posts", () => {
		// `page` comes from a URL segment, so every value below the bound is a
		// billed on-demand render with its own `skip`, `count`, and cache entry.
		// At the previous 10_000 that was a 10k-step walk for a crawler. This
		// pins the order of magnitude, not the exact number — raising it as the
		// corpus grows is expected, jumping it back to 10k is not.
		expect(MAX_PAGE).toBeLessThanOrEqual(100)
		expect(MAX_PAGE * PAGE_SIZE).toBeGreaterThan(100)
	})
})

// #endregion

// #region parseAdminPageParam

describe("parseAdminPageParam", () => {
	it("parses a valid positive integer string", () => {
		expect(parseAdminPageParam("3")).toBe(3)
	})

	it("defaults to 1 for null", () => {
		expect(parseAdminPageParam(null)).toBe(1)
	})

	it("defaults to 1 for undefined", () => {
		expect(parseAdminPageParam(undefined)).toBe(1)
	})

	it("defaults to 1 for non-numeric input", () => {
		expect(parseAdminPageParam("abc")).toBe(1)
	})

	it("defaults to 1 for 0 (below minimum)", () => {
		expect(parseAdminPageParam("0")).toBe(1)
	})

	it("defaults to 1 for a negative integer", () => {
		expect(parseAdminPageParam("-5")).toBe(1)
	})

	it("defaults to 1 for an empty string", () => {
		// `?page=` on the admin dashboard produces exactly this.
		expect(parseAdminPageParam("")).toBe(1)
	})

	it("truncates floats to their integer part", () => {
		expect(parseAdminPageParam("4.7")).toBe(4)
	})

	it("does not clamp input past MAX_PAGE", () => {
		// The admin dashboard is authenticated and single-user, so the public
		// route's probe-cost ceiling doesn't apply — a page past the corpus
		// just renders empty via `skip`/`take`, it doesn't silently alias to
		// the last in-range page the way `parsePageParam` does.
		//
		// A large, arbitrary value rather than `MAX_PAGE + 1`: that boundary
		// value alone can't distinguish "no ceiling" from "a different,
		// reintroduced ceiling somewhere above 31" — this pins the property
		// against a value comfortably clear of any plausible probe-cost ceiling
		// but still under `MAX_SAFE_ADMIN_PAGE` (~214.7M), which is a real,
		// separate bound tested on its own below.
		expect(parseAdminPageParam("1000000")).toBe(1000000)
	})

	it("clamps to MAX_SAFE_ADMIN_PAGE rather than overflowing a 32-bit skip", () => {
		// Not a probe-cost ceiling like MAX_PAGE — see MAX_SAFE_ADMIN_PAGE's own
		// docblock. This is the boundary itself, not an adjacent value, so a
		// future formula change (a different PAGE_SIZE, say) still holds.
		expect(parseAdminPageParam(String(MAX_SAFE_ADMIN_PAGE))).toBe(
			MAX_SAFE_ADMIN_PAGE
		)
		expect(parseAdminPageParam(String(MAX_SAFE_ADMIN_PAGE + 1))).toBe(
			MAX_SAFE_ADMIN_PAGE
		)
		expect(parseAdminPageParam(String(MAX_SAFE_ADMIN_PAGE * 10))).toBe(
			MAX_SAFE_ADMIN_PAGE
		)
	})

	it("keeps a 32-bit-safe skip at the clamped boundary", () => {
		// The invariant MAX_SAFE_ADMIN_PAGE exists to protect: `(page - 1) *
		// PAGE_SIZE` must never exceed a signed 32-bit integer, no matter how
		// large the raw input was.
		const skip = (MAX_SAFE_ADMIN_PAGE - 1) * PAGE_SIZE

		expect(skip).toBeLessThanOrEqual(2 ** 31 - 1)
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

// #region formatDateValue

describe("formatDateValue", () => {
	it("formats a mid-year date in the same shape as formatDate", () => {
		expect(formatDateValue(new Date("2025-01-15T09:30:00.000Z"))).toBe(
			"Jan 15, 2025"
		)
	})

	it("formats a leap-day date", () => {
		expect(formatDateValue(new Date("2024-02-29T12:00:00.000Z"))).toBe(
			"Feb 29, 2024"
		)
	})

	// The reason this can't just delegate to `formatDate`: an instant late in the
	// UTC day would render as the next day in any zone ahead of UTC and the
	// previous one behind it, so the visible dateline would disagree with the
	// JSON-LD `dateModified` built from the same value.
	it("pins to UTC so a late-in-the-day instant renders the same day everywhere", () => {
		expect(formatDateValue(new Date("2026-07-17T23:30:00.000Z"))).toBe(
			"Jul 17, 2026"
		)
	})

	it("pins to UTC for an early-in-the-day instant too", () => {
		expect(formatDateValue(new Date("2026-07-17T00:30:00.000Z"))).toBe(
			"Jul 17, 2026"
		)
	})

	it("formats a year boundary without rolling into the next year", () => {
		expect(formatDateValue(new Date("2024-12-31T23:59:00.000Z"))).toBe(
			"Dec 31, 2024"
		)
	})
})

// #endregion

// #region datetimeToUtcDate

describe("datetimeToUtcDate", () => {
	it("parses a date-only datetime to UTC midnight", () => {
		expect(datetimeToUtcDate("2026-07-13-0000")?.toISOString()).toBe(
			"2026-07-13T00:00:00.000Z"
		)
	})

	it("parses an explicit time", () => {
		expect(datetimeToUtcDate("2026-07-13-0930")?.toISOString()).toBe(
			"2026-07-13T09:30:00.000Z"
		)
	})

	it("parses a datetime with no time component at all", () => {
		expect(datetimeToUtcDate("2026-07-13")?.toISOString()).toBe(
			"2026-07-13T00:00:00.000Z"
		)
	})

	// The whole reason this doesn't reuse `postDatetimeToISO`: that builds a
	// local Date, so in any zone ahead of UTC the stored instant lands on the
	// previous day and every UTC-pinned guide surface renders it a day early.
	it("does not shift the day, whatever the runner's timezone", () => {
		const parsed = datetimeToUtcDate("2026-07-13-0000")

		expect(parsed?.getUTCDate()).toBe(13)
		expect(parsed?.getUTCMonth()).toBe(6)
		expect(parsed?.getUTCFullYear()).toBe(2026)
	})

	it("round-trips through formatDateValue to the same day", () => {
		const parsed = datetimeToUtcDate("2026-07-13-2359")

		expect(formatDateValue(parsed as Date)).toBe("Jul 13, 2026")
	})

	it("returns null on malformed input", () => {
		expect(datetimeToUtcDate("not-a-date")).toBeNull()
		expect(datetimeToUtcDate("")).toBeNull()
	})

	it("returns null on trailing garbage rather than parsing the prefix", () => {
		expect(datetimeToUtcDate("2026-07-13-0000-extra")).toBeNull()
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

	it("removes a typographic (curly) apostrophe, not just a straight one", () => {
		// U+2019 isn't decomposed by NFKD and was missing from the old blacklist,
		// so it leaked into the slug as `new-year’s-resolutions`. The whitelist
		// strips it like any other non-URL-safe char.
		expect(createSlug("New Year’s Resolutions")).toBe("new-years-resolutions")
	})

	it("removes typographic (curly) double quotes", () => {
		expect(createSlug("The “best” way")).toBe("the-best-way")
	})

	it("strips arbitrary non-URL-safe symbols via the whitelist", () => {
		// None of these are in any hand-listed blacklist; the whitelist catches
		// them anyway.
		expect(createSlug("100% @ home + more")).toBe("100-home-more")
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
		// Every character is non-URL-safe, so the whitelist removes them all and
		// the result is "". Same NOT NULL concern as empty input.
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

	// The importer's canonical-shape check relies on this: `createSlug` applied to
	// an already-canonical slug must be a no-op, or every canonical file plans a
	// phantom rewrite on each run.
	it.each([
		"Café au lait",
		"design & code",
		"Swift's new async/await: What's next?",
		"Hello — World",
		"foo---bar",
		"100% @ home + more",
	])("is idempotent for %j", (input) => {
		const once = createSlug(input)

		expect(createSlug(once)).toBe(once)
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
