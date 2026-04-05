import { describe, expect, it } from "vitest"
import { isPrismaNotFound, prisma } from "@/lib/db"

describe("prisma", () => {
	it("exports a defined client when DATABASE_URL is set", () => {
		expect(prisma).toBeDefined()
		expect(prisma).not.toBeNull()
	})

	it("can execute a query against the database", async () => {
		// take: 0 returns an empty array regardless of DB contents, but
		// verifies the connection and schema are reachable.
		const result = await prisma.post.findMany({ take: 0 })
		expect(Array.isArray(result)).toBe(true)
	})
})

describe("isPrismaNotFound", () => {
	it("returns true for a P2025 error object", () => {
		expect(isPrismaNotFound({ code: "P2025" })).toBe(true)
	})

	it("returns false for a different Prisma error code", () => {
		expect(isPrismaNotFound({ code: "P2002" })).toBe(false)
	})

	it("returns false for null", () => {
		expect(isPrismaNotFound(null)).toBe(false)
	})

	it("returns false for undefined", () => {
		expect(isPrismaNotFound(undefined)).toBe(false)
	})

	it("returns false for a plain string", () => {
		expect(isPrismaNotFound("P2025")).toBe(false)
	})

	it("returns false for a number", () => {
		expect(isPrismaNotFound(2025)).toBe(false)
	})

	it("returns false for an object without a code property", () => {
		expect(isPrismaNotFound({ message: "Not found" })).toBe(false)
	})

	it("returns false when code is a number instead of a string", () => {
		expect(isPrismaNotFound({ code: 2025 })).toBe(false)
	})

	it("returns false when code is null", () => {
		expect(isPrismaNotFound({ code: null })).toBe(false)
	})

	it("returns false for an empty object", () => {
		expect(isPrismaNotFound({})).toBe(false)
	})

	it("returns false for an Error instance", () => {
		expect(isPrismaNotFound(new Error("P2025"))).toBe(false)
	})

	it("returns false for an Error with a code property set to a different value", () => {
		const error = Object.assign(new Error("not found"), { code: "P2002" })
		expect(isPrismaNotFound(error)).toBe(false)
	})

	it("returns true for an Error with code P2025 attached", () => {
		const error = Object.assign(new Error("not found"), { code: "P2025" })
		expect(isPrismaNotFound(error)).toBe(true)
	})
})
