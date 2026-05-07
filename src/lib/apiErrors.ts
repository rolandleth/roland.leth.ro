import { NextResponse } from "next/server"
import { isPrismaNotFound } from "@/lib/db"
import { parseIntId } from "@/lib/format"
import type { z } from "zod"

/**
 * Maps a caught error to a 404 response when it is a Prisma "record not found" error.
 * Returns `null` for every other case so the caller can log and return its own 500.
 */
export function handlePrismaError(error: unknown): NextResponse | null {
	if (isPrismaNotFound(error)) {
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
 */
export function respondInternalError(
	tag: string,
	error: unknown
): NextResponse {
	// eslint-disable-next-line no-console
	console.error(tag, error)

	return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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
		// eslint-disable-next-line no-console
		console.error(`${tag} invalid JSON body`)

		return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
	}

	const parsed = schema.safeParse(body)

	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
	}

	return parsed.data as z.infer<T>
}
