// Pure, I/O-free core of the DB→files slug resync (`scripts/init-post-slugs.ts`).
// Mirrors the `postImport.ts` split: the matching and stamp-planning is here and
// unit-tested; the script is the thin shell that reads files, queries the DB,
// and writes. Given one file's content and the section's rows grouped by
// datetime and title, `planStamp` decides whether the file's `slug:` needs
// writing, is already correct, or can't be matched — it never guesses.

import { parseBulkImportFilename } from "@/lib/api/bulkImportParser"
import { parseFrontmatter, setFrontmatterSlug } from "@/lib/import/frontmatter"

export type Row = { slug: string; title: string; datetime: string }

export type StampPlan =
	| { kind: "problem"; message: string }
	| { kind: "unchanged"; slug: string }
	| {
			kind: "write"
			slug: string
			/** Full file content with the resolved `slug:` line in place. */
			content: string
			/** Operator-facing description of the change. */
			change: string
			/** The DB title differs from the file's — a safe admin-side edit, but
			 * flagged so the operator can eyeball it. */
			titleDiffers: boolean
	  }

export function groupBy(
	rows: Row[],
	key: "datetime" | "title"
): Map<string, Row[]> {
	const map = new Map<string, Row[]>()

	for (const row of rows) {
		const group = map.get(row[key])

		if (group == null) {
			map.set(row[key], [row])
		} else {
			group.push(row)
		}
	}

	return map
}

/**
 * The file's DB row when exactly one matches, else `null` for the caller to
 * report. Datetime is the import contract's stable key, so a single datetime
 * hit binds. The exact-title fallback binds ONLY a row that also sits at the
 * file's datetime: that covers same-minute disambiguation (two posts share a
 * minute, the title tells them apart) without ever binding a row at a different
 * datetime — the case where a re-dated file and a brand-new file that merely
 * reuses an existing title are indistinguishable, and stamping the wrong slug
 * would let a later overwrite import clobber the wrong row. Those are reported,
 * not guessed.
 */
export function matchRow(
	byDatetime: Row[] | undefined,
	byTitle: Row[] | undefined,
	fileDatetime: string
): Row | null {
	if (byDatetime?.length === 1) {
		return byDatetime[0]
	}

	if (byTitle?.length === 1 && byTitle[0].datetime === fileDatetime) {
		return byTitle[0]
	}

	return null
}

/**
 * Plans one file's `slug:` stamp against the section's rows: `problem` for an
 * unparseable filename, a missing title, or no unambiguous DB match; `unchanged`
 * when the file is already byte-for-byte canonical for its row's slug; `write`
 * otherwise. The canonical check compares the rewritten content to the original
 * (not the parsed slug to the row's), so trailing whitespace or a quoted value
 * is healed rather than passed over.
 */
export function planStamp(
	filename: string,
	content: string,
	byDatetime: ReadonlyMap<string, Row[]>,
	byTitle: ReadonlyMap<string, Row[]>
): StampPlan {
	const filenameResult = parseBulkImportFilename(filename)

	if (!filenameResult.ok) {
		return {
			kind: "problem",
			message: `${filename} — ${filenameResult.reason}`,
		}
	}

	const { title, slug: fileSlug } = parseFrontmatter(content)

	if (title == null) {
		return {
			kind: "problem",
			message: `${filename} — missing \`title:\` frontmatter`,
		}
	}

	const row = matchRow(
		byDatetime.get(filenameResult.datetime),
		byTitle.get(title),
		filenameResult.datetime
	)

	if (row == null) {
		return {
			kind: "problem",
			message: `${filename} — no unambiguous DB match (datetime ${filenameResult.datetime}, title "${title}")`,
		}
	}

	const rewritten = setFrontmatterSlug(content, row.slug)

	if (rewritten === content) {
		return { kind: "unchanged", slug: row.slug }
	}

	const change =
		fileSlug == null ? `slug: ${row.slug}` : `slug: "${fileSlug}" → ${row.slug}`

	return {
		kind: "write",
		slug: row.slug,
		content: rewritten,
		change,
		titleDiffers: row.title !== title,
	}
}
