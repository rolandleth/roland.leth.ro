import { describe, expect, it } from "vitest"
import { errorDetails, errorMessage } from "@/lib/utils/errorMessage"

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

describe("errorDetails", () => {
	it("pairs an Error's message with its stack", () => {
		const error = new Error("boom")

		expect(errorDetails(error)).toEqual({
			message: "boom",
			stack: error.stack,
		})
	})

	it("omits stack for a non-Error value", () => {
		expect(errorDetails("plain string")).toEqual({
			message: "plain string",
			stack: undefined,
		})
	})

	it("survives JSON.stringify without losing the message or stack", () => {
		// The bug this exists to prevent: `Error.stack`/`.message` live on
		// non-enumerable properties, so `JSON.stringify(new Error("boom"))` is
		// "{}" — any log pipeline that stringifies before storage would drop
		// both. This is what makes the plain-property shape necessary.
		const error = new Error("boom")

		const roundTripped = JSON.parse(JSON.stringify(errorDetails(error)))

		expect(roundTripped.message).toBe("boom")
		expect(roundTripped.stack).toBe(error.stack)
	})
})
