import { describe, expect, it } from "vitest"
import { isAbortError } from "@/lib/client/isAbortError"

describe("isAbortError", () => {
	it("returns true for a DOMException with name 'AbortError'", () => {
		const err = new DOMException("aborted", "AbortError")
		expect(isAbortError(err)).toBe(true)
	})

	it("returns true for a plain Error with name 'AbortError' (happy-dom shape)", () => {
		// happy-dom and some fetch polyfills throw a plain Error rather than a
		// DOMException; both must be swallowed by the admin mutation hooks.
		const err = Object.assign(new Error("aborted"), { name: "AbortError" })
		expect(isAbortError(err)).toBe(true)
	})

	it("returns false for an Error with a different name", () => {
		expect(isAbortError(new Error("network failure"))).toBe(false)
	})

	it("returns false for a DOMException that isn't an AbortError", () => {
		const err = new DOMException("not allowed", "NotAllowedError")
		expect(isAbortError(err)).toBe(false)
	})

	it("returns false for non-error values", () => {
		expect(isAbortError(null)).toBe(false)
		expect(isAbortError(undefined)).toBe(false)
		expect(isAbortError("AbortError")).toBe(false)
		expect(isAbortError({ name: "AbortError" })).toBe(false)
	})
})
