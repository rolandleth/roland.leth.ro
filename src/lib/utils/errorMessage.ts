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
 * Normalizes an unknown thrown value into a JSON-safe `{ message, stack }`
 * pair for structured logging. `Error.stack` lives on a non-enumerable
 * property, so nesting a raw `Error` inside a logged object serializes to `{}`
 * — silently dropping the stack — under any pipeline that `JSON.stringify`s
 * before storing or forwarding a log line. Spread the result into the payload
 * instead of logging `error` directly.
 */
export function errorDetails(error: unknown): {
	message: string
	stack?: string
} {
	return {
		message: errorMessage(error),
		stack: error instanceof Error ? error.stack : undefined,
	}
}
