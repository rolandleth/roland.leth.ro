// Minimal frontmatter for post files: three fields, `title`, `slug` and an
// optional `description`.
// Deliberately NOT a YAML library — the format is a pair of controlled string
// fields we both write and read, so a regex + quote-strip is more robust here
// than a general YAML parser. The value is the LITERAL remainder of the field's
// line, so a title containing `:` / `#` / `[]` (all common in the archive)
// needs no YAML-quoting gymnastics to read back.
//
// Writes are always double-quoted (`title: "..."`) so the block is valid YAML
// in an editor's frontmatter view regardless of punctuation; reads tolerate
// quoted OR bare values so a hand-edit that drops the quotes still works.

import { collapseWhitespace } from "@/lib/content/descriptionRules"

// Leading `---` line, a block, then a closing `---` line. Non-greedy block so
// the FIRST closing `---` ends it, never a `---` further down in the body.
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export type ParsedFrontmatter = {
	title: string | null
	/** `null` when the `slug:` line is absent, `""` when present but blank. */
	slug: string | null
	/**
	 * The authored meta description, or `null` when the line is absent or blank.
	 * Both mean "derive one from the body": unlike `slug`, there's no fix-up to
	 * report for a blank line, so the two collapse.
	 */
	description: string | null
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
 * A field's value from the text after its `key:`: trimmed, unquoted, then
 * trimmed again inside the quotes. The second trim is what makes
 * `description: "   "` read as blank, the same as `description: ""`, instead of
 * as a value of spaces that would be stored as the meta description. Shared by
 * both readers so they agree on what "blank" means.
 */
function fieldValue(remainder: string): string {
	return unquote(remainder.trim()).trim()
}

/**
 * Reads one field's value from the block's lines: the literal remainder of the
 * `<name>:` line, unquoted and trimmed. Returns `null` when the line is absent;
 * `emptyValue` when the line is present but its value is empty — `title`
 * collapses both to `null` (an empty title is a skip either way), while `slug`
 * keeps a present-but-blank field as `""` so the importer can tell a
 * deliberately-blank slug from a missing one when it reports a skip. Matching on
 * the line start, not a substring split, guards against a body (or a title)
 * that itself contains the text `title:`.
 */
function readField(
	lines: string[],
	name: "title" | "slug" | "description",
	emptyValue: string | null
): string | null {
	const line = lines.find((candidate) => candidate.startsWith(`${name}:`))

	if (line == null) {
		return null
	}

	const value = fieldValue(line.slice(name.length + 1))

	return value === "" ? emptyValue : value
}

/**
 * Splits a post file into its frontmatter `title`, `slug`, `description`, and
 * body. Returns
 * `null` for a field when there's no frontmatter block or no line for it inside
 * — the caller decides whether that's a skip (title) or a derive-and-backfill
 * (slug). A present-but-blank `slug:` comes back as `""` rather than `null`, so
 * the caller can report a blank field distinctly from a missing line. The body
 * is everything after the closing `---`, with leading blank
 * lines trimmed so it starts on real content (and matches the DB body
 * byte-for-byte on a re-import).
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
	const match = raw.match(FRONTMATTER_BLOCK)

	if (!match) {
		return { title: null, slug: null, description: null, body: raw }
	}

	const body = raw.slice(match[0].length).replace(/^[\r\n]+/, "")
	const lines = match[1].split(/\r?\n/)

	return {
		title: readField(lines, "title", null),
		slug: readField(lines, "slug", ""),
		description: readField(lines, "description", null),
		body,
	}
}

/**
 * Writes `slug: <value>` into an existing frontmatter block — replacing the
 * current `slug:` line, or inserting one right after `title:` (at the top of
 * the block when there's no title line) when absent. Every other line and the
 * body are preserved byte-for-byte, using the block's own line endings. The
 * value is written bare: slugs are `[a-z0-9-]`, so quoting is never needed.
 * Returns the input unchanged when there is no frontmatter block to write into
 * — the importer only calls this for files whose `title:` parsed, which
 * implies one.
 */
export function setFrontmatterSlug(raw: string, slug: string): string {
	const match = raw.match(FRONTMATTER_BLOCK)

	if (!match) {
		return raw
	}

	const eol = match[0].includes("\r\n") ? "\r\n" : "\n"
	const lines = match[1].split(/\r?\n/)
	const slugIndex = lines.findIndex((line) => line.startsWith("slug:"))

	if (slugIndex >= 0) {
		lines[slugIndex] = `slug: ${slug}`
	} else {
		const titleIndex = lines.findIndex((line) => line.startsWith("title:"))

		lines.splice(titleIndex + 1, 0, `slug: ${slug}`)
	}

	// The block match's trailing newline is optional; mirror whichever form the
	// file had so the byte-for-byte claim above holds even at end-of-file.
	const closing = match[0].endsWith("\n") ? `---${eol}` : "---"

	return `---${eol}${lines.join(eol)}${eol}${closing}${raw.slice(match[0].length)}`
}

export type FrontmatterFields = Readonly<Record<string, string>>

export type FrontmatterResult =
	| { ok: true; fields: FrontmatterFields; body: string }
	| { ok: false; error: string }

/**
 * Strict variant of `parseFrontmatter` for blocks with more than a couple of
 * fields: reads every key into a map, and rejects anything it doesn't recognise.
 *
 * Separate from `parseFrontmatter` rather than replacing it, because the two
 * want opposite failure modes. A post has three known fields and an archive of
 * hand-written files that may carry anything else; ignoring the rest is correct
 * there. A guide has six, they're all load-bearing (a typo'd `descriptoin:`
 * would import a page with no meta description and no complaint), and its files
 * are written against this spec — so unknown and duplicate keys are errors.
 *
 * The parser's inherent rules, which the authoring docs restate:
 *  - values are single-line; a wrapped value's continuation has no `:` and is
 *    reported as malformed rather than silently joined;
 *  - the block must start at byte zero of the file;
 *  - a value that both starts and ends with the same quote character is
 *    unquoted (so quote a value fully, or not at all);
 *  - an empty value counts as absent, so a required-field check catches it.
 */
export function parseFrontmatterFields(
	raw: string,
	allowedKeys: readonly string[]
): FrontmatterResult {
	const match = raw.match(FRONTMATTER_BLOCK)

	if (!match) {
		return {
			ok: false,
			error:
				"No frontmatter block (`---` must be the first line, with a closing `---` below)",
		}
	}

	const allowed = new Set(allowedKeys)
	const seen = new Set<string>()
	const fields: Record<string, string> = {}

	for (const line of match[1].split(/\r?\n/)) {
		if (line.trim() === "") {
			continue
		}

		const separator = line.indexOf(":")

		if (separator <= 0) {
			return {
				ok: false,
				error: `Malformed frontmatter line (expected \`key: value\` on one line): ${line.trim()}`,
			}
		}

		const key = line.slice(0, separator).trim()

		if (!allowed.has(key)) {
			return {
				ok: false,
				error: `Unknown frontmatter key \`${key}\` (allowed: ${allowedKeys.join(", ")})`,
			}
		}

		// The parser would otherwise take the first and ignore the rest, so an
		// edited-but-not-deleted line would import the stale value.
		if (seen.has(key)) {
			return { ok: false, error: `Duplicate frontmatter key \`${key}\`` }
		}

		seen.add(key)

		const value = fieldValue(line.slice(separator + 1))

		if (value !== "") {
			fields[key] = value
		}
	}

	return {
		ok: true,
		fields,
		body: raw.slice(match[0].length).replace(/^[\r\n]+/, ""),
	}
}

/**
 * Escapes a string for embedding inside a double-quoted YAML value: `\` → `\\`,
 * `"` → `\"`. The exact inverse of `unquote`'s double-quoted branch, so any value
 * written with this reads back byte-for-byte, apart from leading and trailing
 * whitespace, which every read trims (`fieldValue`).
 */
function escapeYamlDoubleQuoted(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

/**
 * A `key: "value"` frontmatter line, the value escaped for a double-quoted YAML
 * string. Every writer (`buildPostFile`, the post and guide `.md` exports) quotes
 * free text through this, so the write side and `unquote` can't drift.
 *
 * Whitespace is collapsed first because a line is a line: `parseFrontmatter`
 * reads frontmatter line by line, so a value carrying a newline would emit a
 * block that neither reader can read back — `parseFrontmatter` returns a
 * truncated value with a stray quote, `parseFrontmatterFields` reports the line
 * malformed. `escapeYamlDoubleQuoted` handles `\` and `"`; a newline has no
 * escape here because the format has no place to put one. The schemas collapse
 * titles and descriptions on the way in, so this is the second line of defence
 * for a value that reached the database before that rule existed.
 */
export function quotedFrontmatterLine(key: string, value: string): string {
	return `${key}: "${escapeYamlDoubleQuoted(collapseWhitespace(value))}"`
}

/**
 * A file with a frontmatter block: the `---` fence around `lines`, a blank line,
 * then `body`. The one writer of the shape `FRONTMATTER_BLOCK` reads.
 */
export function frontmatterFile(
	lines: readonly string[],
	body: string
): string {
	return `---\n${lines.join("\n")}\n---\n\n${body}`
}

/**
 * Builds a post file from a title and body: an always-double-quoted frontmatter
 * block, a blank line, then the body. `parseFrontmatter(buildPostFile(t, b))`
 * round-trips to `{ title: t, body: b }` for any body with no leading blank
 * lines, and for any title `collapseWhitespace` leaves alone — which is every
 * title the schemas admit, since they collapse on the way in. A title with
 * padding or an inner newline round-trips to its collapsed form, not to itself.
 */
export function buildPostFile(title: string, body: string): string {
	return frontmatterFile(
		[quotedFrontmatterLine("title", title)],
		body.replace(/^[\r\n]+/, "")
	)
}
