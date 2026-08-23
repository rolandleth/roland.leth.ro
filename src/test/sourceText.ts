/**
 * Helpers for the handful of tests that assert on a source FILE's text rather
 * than on behaviour.
 *
 * Those tests exist where the thing being protected has no runtime surface to
 * observe: `searchParams` absence (a mention anywhere makes the route dynamic,
 * and a static route looks identical to a dynamic one under Vitest), a
 * `cache()` wrapper (dedup needs a real React request scope), a missing
 * `await` (the call still runs, just too late). Each is syntactic, so source
 * text is the only signal — but source text also contains prose, and prose
 * about a symbol reads exactly like a use of it.
 */

/**
 * Removes line comments and block comments (JSDoc included) from TypeScript
 * source, so a test matching on identifiers doesn't trip over a comment that
 * merely mentions one.
 *
 * Replaces each comment with a single space rather than deleting it, so two
 * tokens separated only by a comment don't get glued into a third identifier
 * that never appeared in the file.
 *
 * `simplified:` naive scanner, not a tokenizer — it does not know about string
 * literals, template literals, or regex literals, so a `"//"` inside a string
 * truncates that line and a `"/*"` inside one swallows source up to the next
 * close. Both are false-POSITIVE risks (a match disappears, the test fails
 * loudly) rather than false-negative ones, which is the safe direction for a
 * guard; the upgrade path if it ever bites is TypeScript's own `createScanner`,
 * already available via the installed `typescript` package.
 */
export function stripComments(source: string): string {
	return source
		.replaceAll(/\/\*[\s\S]*?\*\//g, " ")
		.replaceAll(/\/\/[^\n]*/g, " ")
}
