import { describe, expect, it } from "vitest"
import { sanitizeLogString } from "@/lib/api/sanitizeLogString"

describe("sanitizeLogString", () => {
	it("collapses CR / LF / TAB / NUL into single spaces", () => {
		// Log injection: attacker-controlled bytes in `error.message` from the
		// multipart parser could otherwise forge fake log lines beneath the
		// real one. Newlines are the primary vector — strip them.
		expect(sanitizeLogString("line1\nline2")).toBe("line1 line2")
		expect(sanitizeLogString("line1\r\nline2")).toBe("line1 line2")
		expect(sanitizeLogString("col1\tcol2")).toBe("col1 col2")
		expect(sanitizeLogString("a\0b")).toBe("a b")
	})

	it("collapses runs of mixed control characters into a single space", () => {
		expect(sanitizeLogString("foo\n\n\r\tbar")).toBe("foo bar")
	})

	it("preserves printable characters", () => {
		expect(sanitizeLogString("Invalid boundary — got --x")).toBe(
			"Invalid boundary — got --x"
		)
	})

	it("clamps absurdly long messages", () => {
		const long = "a".repeat(500)
		const out = sanitizeLogString(long)
		// 200-char cap + ellipsis. Pin the exact length so a future refactor
		// can't silently uncap.
		expect(out.length).toBe(201)
		expect(out.endsWith("…")).toBe(true)
	})

	it("keeps a value of exactly the cap whole", () => {
		expect(sanitizeLogString("a".repeat(200))).toBe("a".repeat(200))
	})

	it("returns the input unchanged when it has no control characters and is short", () => {
		expect(sanitizeLogString("ok")).toBe("ok")
	})
})
