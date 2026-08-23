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
 * Whether `JSON.stringify` can represent this value without throwing or
 * silently dropping it.
 *
 * `JSON.stringify` has three failure modes that matter to a log payload, and
 * they don't behave the same way: a `BigInt` throws `TypeError`, a circular
 * reference throws `TypeError`, and a function or `symbol` is dropped from the
 * output with no error at all. Only the throwing pair can take down the log
 * line, but a dropped value is a field the docblock below promises and doesn't
 * deliver, so both are excluded here rather than only the dangerous half.
 *
 * Implemented as a `try`/`catch` around the real serializer rather than a
 * hand-written type walk: the set of things `JSON.stringify` rejects is its
 * own to define (a `toJSON` method can make an otherwise-hostile value
 * perfectly serializable), and reimplementing that judgement is how the two
 * drift apart.
 */
function isJsonSerializable(value: unknown): boolean {
	try {
		return JSON.stringify(value) !== undefined
	} catch {
		return false
	}
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
 * Also copies every other own enumerable property the error carries, rather
 * than stopping at `message`/`stack`. A subclassed error can carry real
 * diagnostic value there: Prisma's `PrismaClientKnownRequestError` assigns
 * `code`, `meta`, and `clientVersion` as plain own properties, which DO
 * survive `JSON.stringify` on the raw error — extracting only `message`/`stack`
 * would trade those fields away instead of adding to what a pipeline already
 * preserved, turning "P2025 record not found" and "connection refused" into
 * the same line.
 *
 * The return contract is therefore WIDE: whatever a subclass hangs off itself
 * ends up in the log line verbatim, unredacted and with no size bound. That is
 * the point for Prisma's `meta`, and the thing to remember before attaching a
 * request body, a token, or a large payload to a custom error — the log is
 * where it will surface.
 *
 * Wide, but still JSON-safe: each extra property is checked with
 * `isJsonSerializable` and skipped if it isn't. Without that filter one
 * `BigInt` or circular own property makes `JSON.stringify` throw inside the
 * log pipeline — a failure raised while reporting a failure, which loses the
 * original error entirely. `message`/`stack`/`name` are never filtered; they
 * are strings by construction.
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
	if (!(error instanceof Error)) {
		return { message: errorMessage(error) }
	}

	const extras: Record<string, unknown> = {}

	for (const [key, value] of Object.entries(error)) {
		if (isJsonSerializable(value)) {
			extras[key] = value
		}
	}

	return {
		...extras,
		name: error.name,
		message: error.message,
		stack: error.stack,
	}
}
