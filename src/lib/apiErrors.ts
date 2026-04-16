import { NextResponse } from "next/server"
import { isPrismaNotFound } from "@/lib/db"
import { parseIntId } from "@/lib/format"

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
