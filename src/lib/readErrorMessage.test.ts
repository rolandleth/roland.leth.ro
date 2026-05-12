import { describe, expect, it } from "vitest"
import { readErrorMessage } from "./readErrorMessage"

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	})
}

describe("readErrorMessage", () => {
	it("returns fallback with status suffix when content-type is not JSON", async () => {
		const response = new Response("oops", { status: 502 })
		expect(await readErrorMessage(response, "Save failed")).toBe(
			"Save failed (HTTP 502)"
		)
	})

	it("returns the server's string error with status suffix", async () => {
		const response = jsonResponse(400, { error: "Missing title" })
		expect(await readErrorMessage(response, "Save failed")).toBe(
			"Missing title (HTTP 400)"
		)
	})

	it("returns fallback with status suffix when JSON has no error key", async () => {
		const response = jsonResponse(500, { somethingElse: true })
		expect(await readErrorMessage(response, "Save failed")).toBe(
			"Save failed (HTTP 500)"
		)
	})

	it("returns 'Request failed' with status suffix on malformed JSON", async () => {
		// Content-type claims JSON but the body isn't parseable.
		const response = new Response("{not json", {
			status: 500,
			headers: { "content-type": "application/json" },
		})
		expect(await readErrorMessage(response, "Save failed")).toBe(
			"Request failed (HTTP 500)"
		)
	})

	// Regression: `parseJsonBody` returns `{ error: ZodIssue[] }` on schema
	// validation. Without the array branch the message coerced to
	// `[object Object]` in the rendered admin form.
	it("formats a single ZodIssue as 'path: message' with status suffix", async () => {
		const response = jsonResponse(400, {
			error: [{ path: ["title"], message: "Required" }],
		})
		expect(await readErrorMessage(response, "Save failed")).toBe(
			"title: Required (HTTP 400)"
		)
	})

	it("joins multiple ZodIssues with '; '", async () => {
		const response = jsonResponse(400, {
			error: [
				{ path: ["title"], message: "Required" },
				{ path: ["body"], message: "Too short" },
			],
		})
		expect(await readErrorMessage(response, "Save failed")).toBe(
			"title: Required; body: Too short (HTTP 400)"
		)
	})

	it("omits the path prefix when ZodIssue.path is empty (top-level mismatch)", async () => {
		const response = jsonResponse(400, {
			error: [{ path: [], message: "Expected object, received string" }],
		})
		expect(await readErrorMessage(response, "Save failed")).toBe(
			"Expected object, received string (HTTP 400)"
		)
	})

	it("joins nested ZodIssue path segments with '.'", async () => {
		const response = jsonResponse(400, {
			error: [{ path: ["sections", 0, "title"], message: "Required" }],
		})
		expect(await readErrorMessage(response, "Save failed")).toBe(
			"sections.0.title: Required (HTTP 400)"
		)
	})

	it("falls back when the ZodIssue array is empty", async () => {
		const response = jsonResponse(400, { error: [] })
		expect(await readErrorMessage(response, "Save failed")).toBe(
			"Save failed (HTTP 400)"
		)
	})

	it("falls back when every ZodIssue in the array lacks a message", async () => {
		const response = jsonResponse(400, {
			error: [{ path: ["title"] }, { path: ["body"], message: "" }],
		})
		expect(await readErrorMessage(response, "Save failed")).toBe(
			"Save failed (HTTP 400)"
		)
	})
})
