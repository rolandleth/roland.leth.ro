// The rules every meta description obeys, wherever one is written or derived:
// `Post.description`, `Guide.description`, and whatever `deriveDescription`
// produces. The schema and the derivation share them so neither can accept or
// produce a value the other rejects.
//
// Its own dependency-free module on purpose: `schemas.ts` reaches the client
// bundle (`PostBulkImport.tsx` imports it), and importing any of this from
// `markdown.ts` would pull unified and Shiki in with it.

/** 160 is where Google's desktop snippet truncates. */
export const DESCRIPTION_MAX_CHARS = 160

const ELLIPSIS = "…"

/**
 * Every whitespace run to one space, then trimmed.
 *
 * A description is written to a single frontmatter line, where a raw newline
 * breaks the block, and search results and social cards show it on one line
 * anyway. Collapsing rather than rejecting keeps an author from retyping a
 * pasted paragraph.
 */
export function collapseWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim()
}

/**
 * Truncates to `DESCRIPTION_MAX_CHARS`, ellipsis included, cutting at the last
 * word boundary that fits and falling back to a hard slice when the text has no
 * whitespace within the cap (CJK prose, a long URL).
 *
 * Callers pass text that is already whitespace-collapsed. The result never
 * exceeds the cap: the admin edit form sends a stored description back on every
 * save, and one over the schema's cap makes that post unsaveable until the field
 * is edited by hand.
 *
 * The hard slice cuts on a code point, not a UTF-16 code unit, so it cannot
 * split a surrogate pair and emit a lone surrogate — that branch fires precisely
 * on space-free text, which is where astral characters cluster.
 */
export function capDescription(text: string): string {
	if (text.length <= DESCRIPTION_MAX_CHARS) {
		return text
	}

	const window = text.slice(0, DESCRIPTION_MAX_CHARS)
	const lastSpace = window.lastIndexOf(" ")

	if (lastSpace > 0) {
		return `${window.slice(0, lastSpace)}${ELLIPSIS}`
	}

	return `${sliceCodePoints(window, DESCRIPTION_MAX_CHARS - ELLIPSIS.length)}${ELLIPSIS}`
}

/**
 * The first `limit` UTF-16 code units of `value`, minus a trailing high
 * surrogate left without its pair. Dropping the orphan costs one character and
 * keeps the string valid UTF-8 once serialized.
 */
function sliceCodePoints(value: string, limit: number): string {
	const sliced = value.slice(0, limit)
	const lastCode = sliced.charCodeAt(sliced.length - 1)
	const isLoneHighSurrogate = lastCode >= 0xd800 && lastCode <= 0xdbff

	return isLoneHighSurrogate ? sliced.slice(0, -1) : sliced
}
