/**
 * Extracts a human-readable message from an unknown thrown value. `Error`
 * instances surface their `message`; anything else (a thrown string, number, or
 * plain object) is stringified. Use this instead of re-deriving the same
 * `instanceof Error` ternary at each catch site so the fallback stays uniform.
 */
export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
