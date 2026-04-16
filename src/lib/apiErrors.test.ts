import { NextResponse } from "next/server"
import { describe, expect, it } from "vitest"
import { handlePrismaError, parseIdParam } from "@/lib/apiErrors"

describe("handlePrismaError", () => {
	it("returns a 404 response for a P2025 error", () => {
		const response = handlePrismaError({ code: "P2025" })
		expect(response).not.toBeNull()
		expect(response?.status).toBe(404)
	})

	it("returns a JSON body with an error field for P2025", async () => {
		const response = handlePrismaError({ code: "P2025" })
		const body = await response?.json()
		expect(body).toEqual({ error: "Not found" })
	})

	it("returns null for a different Prisma error code", () => {
		expect(handlePrismaError({ code: "P2002" })).toBeNull()
	})

	it("returns null for null", () => {
		expect(handlePrismaError(null)).toBeNull()
	})

	it("returns null for undefined", () => {
		expect(handlePrismaError(undefined)).toBeNull()
	})

	it("returns null for a plain Error", () => {
		expect(handlePrismaError(new Error("boom"))).toBeNull()
	})
})

describe("parseIdParam", () => {
	it("returns the parsed id for a valid numeric string", async () => {
		const result = await parseIdParam(Promise.resolve({ id: "42" }))
		expect(result).toEqual({ id: 42 })
	})

	it("returns a 400 response for a non-numeric id", async () => {
		const result = await parseIdParam(Promise.resolve({ id: "abc" }))
		expect(result).toBeInstanceOf(NextResponse)

		if (result instanceof NextResponse) {
			expect(result.status).toBe(400)
		}
	})

	it("returns a 400 response for an empty id", async () => {
		const result = await parseIdParam(Promise.resolve({ id: "" }))
		expect(result).toBeInstanceOf(NextResponse)

		if (result instanceof NextResponse) {
			expect(result.status).toBe(400)
		}
	})

	it("parses negative integers", async () => {
		const result = await parseIdParam(Promise.resolve({ id: "-1" }))
		expect(result).toEqual({ id: -1 })
	})
})
