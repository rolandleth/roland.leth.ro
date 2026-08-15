/**
 * A 12-char URL-safe id for correlating log lines.
 *
 * Crypto-strong: no guessability is needed, but it's free enough not to bother
 * with `Math.random`. Shared by `respondInternalError` (which returns the id to
 * the client so a report can be matched to a stack) and by the middleware-bypass
 * logger, so a self-hosted deploy can grep by id. Vercel surfaces its own
 * platform request id, but that's only available on Vercel — the app should be
 * debuggable elsewhere too.
 */
export function randomShortId(): string {
	return crypto.randomUUID().replace(/-/g, "").slice(0, 12)
}
