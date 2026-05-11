/**
 * Returns `true` when the thrown error is an `AbortController.abort()` signal.
 *
 * Different fetch implementations surface aborts as either `DOMException` (the
 * browser standard) or as a plain `Error` whose `name` is `"AbortError"`
 * (happy-dom in tests, some polyfills). Five admin call sites used to spell
 * this check out by hand with subtly different shapes — this helper unifies
 * the contract so a future test-environment switch can't silently turn a
 * supposed-to-be-swallowed abort into a surfaced error.
 */
export function isAbortError(err: unknown): boolean {
	if (err instanceof DOMException && err.name === "AbortError") {
		return true
	}

	if (err instanceof Error && err.name === "AbortError") {
		return true
	}

	return false
}
