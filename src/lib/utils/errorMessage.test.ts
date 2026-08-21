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
	it("pairs an Error's name, message, and stack", () => {
		const error = new Error("boom")

		expect(errorDetails(error)).toStrictEqual({
			name: "Error",
			message: "boom",
			stack: error.stack,
		})
	})

	it("omits stack (and name) for a non-Error value", () => {
		// `toStrictEqual`, not `toEqual` — the two treat a missing key and an
		// explicit `key: undefined` as different, and only the strict form
		// catches a regression back to always emitting `stack: undefined`.
		expect(errorDetails("plain string")).toStrictEqual({
			message: "plain string",
		})
	})

	it("preserves a subclass's own enumerable properties", () => {
		// Modeled on Prisma's PrismaClientKnownRequestError, which assigns
		// `code`/`meta`/`clientVersion` as plain own properties — real
		// diagnostic value (distinguishing "P2025 record not found" from a
		// connection failure) that a message/stack-only extraction would
		// silently drop instead of adding to what `JSON.stringify` on the raw
		// error already preserved.
		class KnownRequestError extends Error {
			code: string
			meta: { target: string[] }

			constructor(message: string, code: string, meta: { target: string[] }) {
				super(message)
				this.name = "PrismaClientKnownRequestError"
				this.code = code
				this.meta = meta
			}
		}
		const error = new KnownRequestError("Record not found", "P2025", {
			target: ["Post"],
		})

		expect(errorDetails(error)).toStrictEqual({
			name: "PrismaClientKnownRequestError",
			message: "Record not found",
			stack: error.stack,
			code: "P2025",
			meta: { target: ["Post"] },
		})
	})

	it("survives JSON.stringify without losing the message, stack, or extra fields", () => {
		// The bug this exists to prevent: `Error.stack`/`.message` live on
		// non-enumerable properties, so `JSON.stringify(new Error("boom"))` is
		// "{}" — any log pipeline that stringifies before storage would drop
		// both. This is what makes the plain-property shape necessary.
		class KnownRequestError extends Error {
			code = "P2025"
		}
		const error = new KnownRequestError("boom")

		const roundTripped = JSON.parse(JSON.stringify(errorDetails(error)))

		expect(roundTripped.message).toBe("boom")
		expect(roundTripped.stack).toBe(error.stack)
		expect(roundTripped.code).toBe("P2025")
	})
})
