import { NextResponse } from "next/server"
import { describe, expect, it, vi } from "vitest"
import {
	handlePrismaError,
	parseIdParam,
	respondInternalError,
} from "@/lib/apiErrors"

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

describe("respondInternalError", () => {
	it("returns a 500 JSON response with a generic error message and a request id", async () => {
		const response = respondInternalError("[test]", new Error("boom"))
		expect(response.status).toBe(500)
		const body = await response.json()
		expect(body.error).toBe("Internal server error")
		// 12 hex chars from a UUID with dashes stripped — pinned so the contract
		// is stable for log-correlation grep.
		expect(body.requestId).toMatch(/^[0-9a-f]{12}$/)
	})

	it("logs the tag, the request id, and the error to the console", () => {
		// `console.error` is silenced by the test setup, so read the mock calls
		// directly instead of capturing stderr.
		const err = new Error("db offline")
		respondInternalError("[api:tag]", err)

		const mock = vi.mocked(console.error)
		expect(mock).toHaveBeenCalledWith(
			"[api:tag]",
			expect.objectContaining({ requestId: expect.any(String) }),
			err
		)
	})
})
