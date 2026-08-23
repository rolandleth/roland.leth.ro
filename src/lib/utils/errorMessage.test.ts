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

	// #region non-serializable own properties

	// The failure mode the `isJsonSerializable` filter exists for: copying every
	// own enumerable property means copying whatever a subclass hung off itself,
	// and three kinds of value break `JSON.stringify`. Unfiltered, each of these
	// makes the log pipeline throw *while reporting an error*, which loses the
	// original error entirely — strictly worse than the dropped `stack` this
	// whole function exists to prevent.
	it("drops a BigInt property rather than letting JSON.stringify throw", () => {
		// `BigInt(...)` rather than a `9007199254740993n` literal: this project's
		// `target` predates ES2020, which is when the literal syntax landed.
		class BigIntError extends Error {
			rowId = BigInt("9007199254740993")
		}
		const error = new BigIntError("boom")

		const details = errorDetails(error)

		expect(details).not.toHaveProperty("rowId")
		expect(() => JSON.stringify(details)).not.toThrow()
	})

	it("drops a circular property rather than letting JSON.stringify throw", () => {
		// A `cause` assigned by hand is the realistic shape: the constructor
		// option (`new Error(msg, { cause })`) defines it non-enumerable, so it
		// never reaches the spread — but `this.cause = err` in a subclass does,
		// and a wrapper error pointing back at its own wrapper is a cycle.
		class CircularError extends Error {
			self: unknown

			constructor(message: string) {
				super(message)
				this.self = this
			}
		}
		const error = new CircularError("boom")

		const details = errorDetails(error)

		expect(details).not.toHaveProperty("self")
		expect(() => JSON.stringify(details)).not.toThrow()
	})

	it("drops a function property, which JSON.stringify would silently omit", () => {
		// Not a crash, but a field the return contract claims to carry and
		// doesn't — `JSON.stringify` erases functions with no error. Excluded at
		// the source so the returned object and its serialized form agree.
		class CallbackError extends Error {
			retry = () => undefined
		}
		const error = new CallbackError("boom")

		expect(errorDetails(error)).not.toHaveProperty("retry")
	})

	it("keeps the serializable fields on an error that also carries a hostile one", () => {
		// The filter is per-property, not all-or-nothing: one bad field must not
		// cost the diagnostics sitting next to it.
		class MixedError extends Error {
			code = "P2025"
			rowId = BigInt(1)
		}
		const error = new MixedError("boom")

		const details = errorDetails(error)

		expect(details.code).toBe("P2025")
		expect(details).not.toHaveProperty("rowId")
		expect(details.message).toBe("boom")
		expect(details.stack).toBe(error.stack)
	})

	it("keeps a property whose toJSON makes it serializable", () => {
		// Why the filter defers to `JSON.stringify` instead of type-checking:
		// a Date (and anything else with `toJSON`) is an object the naive
		// "is it a primitive" test would reject, and the real serializer
		// accepts. Prisma timestamps arrive this way.
		class TimestampedError extends Error {
			occurredAt = new Date("2026-08-22T09:00:00.000Z")
		}
		const error = new TimestampedError("boom")

		expect(errorDetails(error).occurredAt).toEqual(
			new Date("2026-08-22T09:00:00.000Z")
		)
	})

	// #endregion
})
