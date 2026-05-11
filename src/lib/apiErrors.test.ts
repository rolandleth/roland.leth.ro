import { NextResponse } from "next/server"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import {
	handlePrismaError,
	parseIdParam,
	parseJsonBody,
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

describe("parseJsonBody", () => {
	const schema = z.object({ name: z.string().min(1) })

	function jsonRequest(body: string): Request {
		return new Request("http://localhost/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body,
		})
	}

	it("returns the parsed data on a valid payload", async () => {
		const result = await parseJsonBody(
			jsonRequest(JSON.stringify({ name: "hello" })),
			schema,
			"[test]"
		)
		expect(result).toEqual({ name: "hello" })
	})

	it("returns a 400 NextResponse on malformed JSON and logs the tag at warn", async () => {
		// Routine client-bug signal (peer of the schema-validation warn below).
		// Logging at error would let any malformed-body probe dominate the error
		// log; warn keeps the line greppable without flooding alerts.
		const response = await parseJsonBody(
			jsonRequest("not-json"),
			schema,
			"[test]"
		)
		expect(response).toBeInstanceOf(NextResponse)
		expect((response as NextResponse).status).toBe(400)
		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[test] invalid JSON body"
		)
		expect(vi.mocked(console.error)).not.toHaveBeenCalled()
	})

	it("returns a 400 NextResponse on schema mismatch and logs paths-only at warn", async () => {
		// Mirrors the login route's pattern: log issue paths so a real client
		// bug is debuggable without leaking submitted values into the access
		// log. Before this lived in the shared helper, every admin POST/PUT
		// with a malformed body was rejected silently.
		const response = await parseJsonBody(
			jsonRequest(JSON.stringify({ name: "" })),
			schema,
			"[api:test]"
		)
		expect(response).toBeInstanceOf(NextResponse)
		expect((response as NextResponse).status).toBe(400)
		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[api:test] schema validation failed: name"
		)
	})

	it("falls back to issue codes when every path is empty (top-level mismatch)", async () => {
		// A body that fails at the top of the schema (e.g. `5` against
		// `z.object`) produces issues with empty `path`; without a fallback the
		// log line degenerates to "schema validation failed:" with nothing
		// after, giving operators no signal.
		const response = await parseJsonBody(
			jsonRequest("5"),
			z.object({ name: z.string() }),
			"[api:test]"
		)
		expect(response).toBeInstanceOf(NextResponse)
		expect((response as NextResponse).status).toBe(400)
		const warnCall = vi
			.mocked(console.warn)
			.mock.calls.find((args) =>
				String(args[0]).startsWith("[api:test] schema validation failed:")
			)
		expect(warnCall).toBeDefined()
		// Whatever the code is, the line must not end with "failed: " (empty tail).
		expect(String(warnCall?.[0])).not.toMatch(/failed:\s*$/)
	})

	it("never logs submitted field values", async () => {
		// Defense against a future refactor that adds values to the log line.
		// If anyone reads a request log to debug a schema failure, they must
		// not see "secret-password-123" simply because the user typo'd it.
		await parseJsonBody(
			jsonRequest(JSON.stringify({ name: "secret-password-123" })),
			z.object({ name: z.number() }),
			"[api:test]"
		)
		const warnCalls = vi.mocked(console.warn).mock.calls
		for (const call of warnCalls) {
			expect(call.join(" ")).not.toContain("secret-password-123")
		}
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
