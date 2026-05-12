import { NextResponse } from "next/server"
import { isPrismaNotFound } from "@/lib/db"
import { parseIntId } from "@/lib/format"
import type { z } from "zod"

/**
 * Maps a caught error to a 404 response when it is a Prisma "record not found" error.
 * Returns `null` for every other case so the caller can log and return its own 500.
 *
 * The `tag` is logged at warn level on a 404 so operators can tell the
 * difference between "stale UI tried to delete record N" and "DB lost the
 * record" — both produce 404s, but the first is benign and the second is not.
 */
export function handlePrismaError(
	error: unknown,
	tag?: string
): NextResponse | null {
	if (isPrismaNotFound(error)) {
		if (tag != null) {
			// eslint-disable-next-line no-console
			console.warn(`${tag} record not found`)
		}

		return NextResponse.json({ error: "Not found" }, { status: 404 })
	}

	return null
}

/**
 * Awaits a route's `{ id }` params and parses the `id` segment to a number.
 * Returns a 400 response when the id is not a valid integer.
 */
export async function parseIdParam(
	params: Promise<{ id: string }>
): Promise<{ id: number } | NextResponse> {
	const { id } = await params
	const parsed = parseIntId(id)

	if (parsed === null) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 })
	}

	return { id: parsed }
}

/**
 * Logs an unexpected error with a route-identifying tag and returns a generic
 * 500 response. The tag (e.g. `[api:admin:posts:POST]`) is what shows up in
 * Vercel logs so operators can tell which handler failed without opening the
 * stack trace.
 *
 * A short request id is generated server-side, included in the response body,
 * and logged alongside the stack so a self-hosted deploy can grep logs by id
 * (Vercel surfaces its own platform request id, but that's only available on
 * Vercel — the app should be debuggable elsewhere too).
 */
export function respondInternalError(
	tag: string,
	error: unknown
): NextResponse {
	const requestId = randomShortId()
	// eslint-disable-next-line no-console
	console.error(tag, { requestId }, error)

	return NextResponse.json(
		{ error: "Internal server error", requestId },
		{ status: 500 }
	)
}

function randomShortId(): string {
	// 12-char URL-safe id is plenty for log correlation. Crypto-strong (no
	// guessability needed but free enough not to bother with Math.random).
	return crypto.randomUUID().replace(/-/g, "").slice(0, 12)
}

/**
 * Parses the request JSON body and validates it against `schema`. Returns the
 * parsed data on success, or a NextResponse on any failure (malformed JSON →
 * 400, schema mismatch → 400 with zod issues). Centralised so every admin
 * write handler treats parser errors identically.
 */
export async function parseJsonBody<T extends z.ZodTypeAny>(
	request: Request,
	schema: T,
	tag: string
): Promise<z.infer<T> | NextResponse> {
	let body: unknown

	try {
		body = await request.json()
	} catch {
		// Routine client-bug signal (malformed JSON from a flapping admin form,
		// a probe, or a stale tab); warn rather than error so it doesn't dominate
		// the error log under sustained traffic. Same level as the peer
		// schema-validation log below.
		// eslint-disable-next-line no-console
		console.warn(`${tag} invalid JSON body`)

		return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
	}

	const parsed = schema.safeParse(body)

	if (!parsed.success) {
		// Log issue paths only (never values) so a real client bug is debuggable
		// without leaking submitted payloads into the access log. Mirrors the
		// login route's pattern and closes the gap where every admin POST/PUT
		// with a malformed body was silently rejecting in logs.
		const issueSignature = describeZodIssues(parsed.error.issues)
		// eslint-disable-next-line no-console
		console.warn(`${tag} schema validation failed: ${issueSignature}`)

		return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
	}

	return parsed.data as z.infer<T>
}

/**
 * Renders a Zod issue list as a values-free signature suitable for log lines.
 * Prefers the `path.join(".")` of each issue; falls back to `issue.code` joins
 * when every path is empty (top-level type mismatch, e.g. `body = 5`), so the
 * log line never degenerates to `schema validation failed:` with nothing after.
 *
 * Capped at `MAX_ISSUE_SEGMENTS` segments so a pathological payload with
 * hundreds of nested issues doesn't produce a multi-KB log line per request —
 * with the warn-level demotion above, an unbounded line is log spam per
 * malformed probe.
 *
 * Typed structurally rather than against Zod's exported `ZodIssue` (deprecated
 * in v4) so this helper stays decoupled from Zod's internal type churn.
 */
const MAX_ISSUE_SEGMENTS = 10

function describeZodIssues(
	issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; code: string }>
): string {
	const paths = issues
		.map((issue) => issue.path.join("."))
		.filter((path) => path !== "")

	const segments = paths.length > 0 ? paths : issues.map((issue) => issue.code)

	if (segments.length <= MAX_ISSUE_SEGMENTS) {
		return segments.join(", ")
	}

	const head = segments.slice(0, MAX_ISSUE_SEGMENTS).join(", ")
	const remainder = segments.length - MAX_ISSUE_SEGMENTS

	return `${head}, +${remainder} more`
}
