import { describe, expect, it } from "vitest"
import { parseBulkImportFilename } from "./bulkImportParser"

// #region Happy path

describe("parseBulkImportFilename happy path", () => {
	it("parses date + time + title", () => {
		expect(parseBulkImportFilename("2026-05-15-1430-A real post.md")).toEqual({
			ok: true,
			datetime: "2026-05-15-1430",
			title: "A real post",
		})
	})

	it("defaults time to 0000 when omitted", () => {
		expect(parseBulkImportFilename("2026-05-15-Reflections.md")).toEqual({
			ok: true,
			datetime: "2026-05-15-0000",
			title: "Reflections",
		})
	})

	it("preserves spaces, capitalization, and punctuation in the title", () => {
		expect(
			parseBulkImportFilename("2026-01-02-1200-Why I Don't Use Foo (yet).md")
		).toEqual({
			ok: true,
			datetime: "2026-01-02-1200",
			title: "Why I Don't Use Foo (yet)",
		})
	})

	it("trims surrounding whitespace from the title", () => {
		expect(parseBulkImportFilename("2026-05-15-  Spaced  .md")).toEqual({
			ok: true,
			datetime: "2026-05-15-0000",
			title: "Spaced",
		})
	})

	it("accepts a title that starts with a digit (not mistaken for a time)", () => {
		// `1500` isn't preceded by another `-time` group, so the optional time
		// capture stays at the date suffix and `1500 Reasons` is the title.
		expect(parseBulkImportFilename("2026-05-15-1430-1500 Reasons.md")).toEqual({
			ok: true,
			datetime: "2026-05-15-1430",
			title: "1500 Reasons",
		})
	})

	it("preserves Unicode titles verbatim (NFKD only applies to the derived slug, not the stored title)", () => {
		// 2026-05-16 review: `createSlug` decomposes accents (`é` → `e`) but the
		// stored `title` must keep the user-typed form. Pins that the parser
		// doesn't fold characters before the title leaves it.
		expect(parseBulkImportFilename("2026-05-15-Café Notes.md")).toEqual({
			ok: true,
			datetime: "2026-05-15-0000",
			title: "Café Notes",
		})
	})
})

// #endregion

// #region Hardened title character class

describe("parseBulkImportFilename rejects unsafe title characters", () => {
	// 2026-05-16 review: the raw `title` flows into audit log payloads and the
	// per-file result panel. Path separators and ASCII control chars would
	// either look like path traversal in audit text or corrupt log line
	// boundaries, so the regex blocks them at parse time.

	it("rejects a forward-slash in the title (path traversal shape)", () => {
		const result = parseBulkImportFilename("2026-05-15-foo/bar.md")
		expect(result.ok).toBe(false)
	})

	it("rejects a backslash in the title", () => {
		const result = parseBulkImportFilename("2026-05-15-foo\\bar.md")
		expect(result.ok).toBe(false)
	})

	it("rejects a control char (newline) in the title", () => {
		const result = parseBulkImportFilename("2026-05-15-foo\nbar.md")
		expect(result.ok).toBe(false)
	})

	it("rejects a control char (tab) in the title", () => {
		const result = parseBulkImportFilename("2026-05-15-foo\tbar.md")
		expect(result.ok).toBe(false)
	})
})

// #endregion

// #region Failures

describe("parseBulkImportFilename failures", () => {
	it("rejects a filename with no .md extension", () => {
		const result = parseBulkImportFilename("2026-05-15-Reflections.txt")
		expect(result.ok).toBe(false)
	})

	it("rejects a filename with no date prefix", () => {
		const result = parseBulkImportFilename("Reflections.md")
		expect(result.ok).toBe(false)
	})

	it("rejects an empty title", () => {
		const result = parseBulkImportFilename("2026-05-15-.md")
		expect(result.ok).toBe(false)
	})

	it("rejects a whitespace-only title", () => {
		const result = parseBulkImportFilename("2026-05-15-   .md")
		if (result.ok) {
			throw new Error("expected failure")
		}
		expect(result.reason).toMatch(/empty/i)
	})

	it("rejects an impossible calendar date", () => {
		const result = parseBulkImportFilename("2026-02-31-Title.md")
		if (result.ok) {
			throw new Error("expected failure")
		}
		expect(result.reason).toMatch(/date/i)
	})

	it("rejects a 13th month", () => {
		const result = parseBulkImportFilename("2026-13-01-Title.md")
		if (result.ok) {
			throw new Error("expected failure")
		}
		expect(result.reason).toMatch(/date/i)
	})

	it("rejects an out-of-range time", () => {
		const result = parseBulkImportFilename("2026-05-15-2599-Title.md")
		if (result.ok) {
			throw new Error("expected failure")
		}
		expect(result.reason).toMatch(/time/i)
	})

	it("rejects a 24-hour time", () => {
		const result = parseBulkImportFilename("2026-05-15-2400-Title.md")
		if (result.ok) {
			throw new Error("expected failure")
		}
		expect(result.reason).toMatch(/time/i)
	})
})

// #endregion
