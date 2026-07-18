import { describe, expect, it } from "vitest"
import { errorMessage } from "@/lib/utils/errorMessage"

describe("errorMessage", () => {
	it("returns the message of an Error instance", () => {
		expect(errorMessage(new Error("boom"))).toBe("boom")
	})

	it("preserves messages from Error subclasses", () => {
		class CustomError extends Error {}

		expect(errorMessage(new CustomError("custom"))).toBe("custom")
	})

	it("stringifies a thrown string", () => {
		expect(errorMessage("plain string")).toBe("plain string")
	})

	it("stringifies a thrown non-Error value", () => {
		expect(errorMessage(42)).toBe("42")
		expect(errorMessage(null)).toBe("null")
		expect(errorMessage(undefined)).toBe("undefined")
	})
})
