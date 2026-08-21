/**
 * Extracts a human-readable message from an unknown thrown value. `Error`
 * instances surface their `message`; anything else (a thrown string, number, or
 * plain object) is stringified. Use this instead of re-deriving the same
 * `instanceof Error` ternary at each catch site so the fallback stays uniform.
 */
export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

/**
 * Normalizes an unknown thrown value into a JSON-safe object for structured
 * logging.
 *
 * Explicitly pulls `message` and `stack`: both live on non-enumerable
 * properties, so nesting a raw `Error` directly in a logged object serializes
 * to `{}` — silently dropping both — under any pipeline that `JSON.stringify`s
 * before storing or forwarding a log line.
 *
 * Also spreads every other own enumerable property the error carries, rather
 * than stopping at `message`/`stack`. A subclassed error can carry real
 * diagnostic value there: Prisma's `PrismaClientKnownRequestError` assigns
 * `code`, `meta`, and `clientVersion` as plain own properties, which DO
 * survive `JSON.stringify` on the raw error — extracting only `message`/`stack`
 * would trade those fields away instead of adding to what a pipeline already
 * preserved, turning "P2025 record not found" and "connection refused" into
 * the same line.
 *
 * Nest the result under a key at the call site (`error: errorDetails(error)`)
 * rather than spreading it into the payload, so the error fields stay visually
 * grouped and distinct from the rest of the log line.
 */
export function errorDetails(
	error: unknown
): { message: string; name?: string; stack?: string } & Record<
	string,
	unknown
> {
	if (error instanceof Error) {
		return {
			...error,
			name: error.name,
			message: error.message,
			stack: error.stack,
		}
	}

	return { message: errorMessage(error) }
}
