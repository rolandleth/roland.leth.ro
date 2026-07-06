// Minimal frontmatter for post files: one field, `title`. Deliberately NOT a
// YAML library — the format is a single controlled string field we both write
// and read, so a regex + quote-strip is more robust here than a general YAML
// parser. The value is the LITERAL remainder of the `title:` line, so a title
// containing `:` / `#` / `[]` (all common in the archive) needs no YAML-quoting
// gymnastics to read back.
//
// Writes are always double-quoted (`title: "..."`) so the block is valid YAML
// in an editor's frontmatter view regardless of punctuation; reads tolerate
// quoted OR bare values so a hand-edit that drops the quotes still works.

// Leading `---` line, a block, then a closing `---` line. Non-greedy block so
// the FIRST closing `---` ends it, never a `---` further down in the body.
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export type ParsedFrontmatter = {
	title: string | null
	body: string
}

function unquote(value: string): string {
	if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
		// Reverse the write-side escaping: `\\` → `\`, `\"` → `"`.
		return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
	}

	if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
		return value.slice(1, -1).replace(/''/g, "'")
	}

	return value
}

/**
 * Splits a post file into its frontmatter `title` and body. Returns
 * `title: null` when there's no frontmatter block or no `title:` line inside it
 * — the caller decides whether that's a skip. The body is everything after the
 * closing `---`, with leading blank lines trimmed so it starts on real content
 * (and matches the DB body byte-for-byte on a re-import).
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
	const match = raw.match(FRONTMATTER_BLOCK)

	if (!match) {
		return { title: null, body: raw }
	}

	const body = raw.slice(match[0].length).replace(/^[\r\n]+/, "")
	// Match the `title:` line, not a substring split — guards against a body (or
	// a title) that itself contains the text "title:".
	const titleLine = match[1].split(/\r?\n/).find((line) => /^title:/.test(line))

	if (titleLine == null) {
		return { title: null, body }
	}

	const value = unquote(titleLine.replace(/^title:[ \t]*/, "").trim())

	return { title: value === "" ? null : value, body }
}

/**
 * Escapes a string for embedding inside a double-quoted YAML value: `\` → `\\`,
 * `"` → `\"`. The exact inverse of `unquote`'s double-quoted branch, so any value
 * written with this reads back byte-for-byte. Shared by every frontmatter writer
 * (`buildPostFile`, the `.md` export) so the write/read pair can't drift.
 */
export function escapeYamlDoubleQuoted(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

/**
 * Builds a post file from a title and body: an always-double-quoted frontmatter
 * block, a blank line, then the body. `parseFrontmatter(buildPostFile(t, b))`
 * round-trips to `{ title: t, body: b }` for any title and any body with no
 * leading blank lines.
 */
export function buildPostFile(title: string, body: string): string {
	return `---\ntitle: "${escapeYamlDoubleQuoted(title)}"\n---\n\n${body.replace(/^[\r\n]+/, "")}`
}
