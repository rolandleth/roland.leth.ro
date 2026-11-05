// The post importer's edit window: `--last=<n>` limits a run to the newest n
// files, 10 by default, because only recent posts still get edited. `0` lifts
// the limit.
//
// "Newest" goes by the datetime in the filename, not by name order: sorting by
// name puts `2024-01-05-Title.md` (00:00) after `2024-01-05-0930-Other.md`.

import { parseBulkImportFilename } from "@/lib/api/bulkImportParser"
import { valueFlagPlaceholder } from "./cliArgs"
import {
	type ImportFile,
	type ParsedPostFile,
	parsePostFiles,
	type SkippedFile,
} from "./postImport"

export const LAST_FLAG = "--last"

/** How many of the newest files a run takes when `--last` is absent. */
export const DEFAULT_RECENT_POST_COUNT = 10

/**
 * Resolves `--last=<n>` to a count: the default when absent, `0` for every
 * file. Anything but a whole number of 0 or more is a `problem` rather than a
 * guess, so the script refuses to start, as it does for its other argument
 * errors.
 */
export function resolveLastArg(
	value: string | undefined
): { count: number } | { problem: string } {
	if (value == null) {
		return { count: DEFAULT_RECENT_POST_COUNT }
	}

	if (!/^\d+$/.test(value)) {
		return {
			problem: `"${value}" is not a valid ${LAST_FLAG}. Use ${valueFlagPlaceholder(LAST_FLAG)} with a whole number of 0 or more; 0 imports every file.`,
		}
	}

	return { count: Number(value) }
}

/**
 * Parses the whole folder, then keeps only the files in the window: the
 * `count` newest by filename datetime, or every file when `count` is 0.
 *
 * The parse runs over every file so the duplicate-slug check still spans the
 * folder. A new file copied from an old one, `slug:` left unchanged, must skip
 * as a duplicate; parsed alone, it would match the old post's row, and
 * `--overwrite` would replace that post's title, body and date.
 *
 * A file whose name has no valid datetime is always kept: its age is unknown,
 * and it surfaces as a skip with the filename problem instead of vanishing.
 * Files in the window that skip still count toward `count`.
 */
export function parseRecentPostFiles(
	files: readonly ImportFile[],
	count: number
): { parsed: ParsedPostFile[]; skipped: SkippedFile[]; leftOut: number } {
	const { parsed, skipped } = parsePostFiles(files)

	if (count === 0) {
		return { parsed, skipped, leftOut: 0 }
	}

	const kept = recentFilenames(
		files.map((file) => file.filename),
		count
	)
	const isKept = (file: { filename: string }) => kept.has(file.filename)

	return {
		parsed: parsed.filter(isKept),
		skipped: skipped.filter(isKept),
		leftOut: files.length - kept.size,
	}
}

/**
 * The `count` newest dated filenames plus every undated one. Equal datetimes
 * order by filename, so the cut is stable from run to run.
 */
function recentFilenames(
	filenames: readonly string[],
	count: number
): Set<string> {
	const dated: { filename: string; datetime: string }[] = []
	const undated: string[] = []

	for (const filename of filenames) {
		const result = parseBulkImportFilename(filename)

		if (result.ok) {
			dated.push({ filename, datetime: result.datetime })
		} else {
			undated.push(filename)
		}
	}

	// `yyyy-MM-dd-HHmm` is fixed-width, so string order is chronological.
	dated.sort(
		(a, b) =>
			compareStrings(a.datetime, b.datetime) ||
			compareStrings(a.filename, b.filename)
	)

	return new Set([
		...dated.slice(-count).map((file) => file.filename),
		...undated,
	])
}

function compareStrings(a: string, b: string): number {
	if (a === b) {
		return 0
	}

	return a < b ? -1 : 1
}
