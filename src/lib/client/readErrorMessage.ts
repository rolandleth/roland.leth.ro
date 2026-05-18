/**
 * Reads a user-facing error message from a non-ok Response. Always appends the
 * HTTP status so the message is debuggable from the rendered UI without DevTools.
 *
 * Handles two response body shapes: `{ error: string }` (most handlers) and
 * `{ error: ZodIssue[] }` (the schema-validation 400 returned by `parseJsonBody`).
 * The array case is flattened to `path: message; path: message` so the rendered
 * error names the offending field instead of coercing to `[object Object]`.
 *
 * Lives in `lib/` (not the admin hook module that originally exported it) so
 * it's importable from any component without dragging the hook's `"use client"`
 * semantics through the call site.
 */
export type ZodIssueLike = {
	path?: Array<string | number>
	message?: string
}

export async function readErrorMessage(
	response: Response,
	fallback: string
): Promise<string> {
	const statusSuffix = ` (HTTP ${response.status})`
	const contentType = response.headers.get("content-type") ?? ""

	if (!contentType.includes("application/json")) {
		return fallback + statusSuffix
	}

	try {
		const data = (await response.json()) as {
			error?: string | ZodIssueLike[]
		}

		if (Array.isArray(data.error)) {
			const formatted = formatZodIssues(data.error)

			return (formatted ?? fallback) + statusSuffix
		}

		return (data.error ?? fallback) + statusSuffix
	} catch {
		// Distinguish malformed JSON from the HTTP error itself.
		return "Request failed" + statusSuffix
	}
}

function formatZodIssues(issues: ZodIssueLike[]): string | null {
	const parts = issues.flatMap((issue) => {
		const message = issue.message

		if (message == null || message === "") {
			return []
		}

		// Defensive filter: the declared shape is `Array<string | number>`, but
		// Zod's runtime path occasionally surfaces `undefined` segments (older
		// internal types, custom-issue contributions). Coercing those into
		// `"undefined"` would surface a confusing message to the admin; drop
		// instead so the path collapses cleanly.
		const path = (issue.path ?? [])
			.filter(
				(segment): segment is string | number =>
					segment != null && segment !== ""
			)
			.join(".")

		return path === "" ? [message] : [`${path}: ${message}`]
	})

	if (parts.length === 0) {
		return null
	}

	return parts.join("; ")
}
