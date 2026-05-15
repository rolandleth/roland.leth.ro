// `yyyy-MM-dd[-HHmm]-Title with spaces.md`. Title is captured verbatim — your
// filenames already carry the literal display title, so no slug-decode is needed.
const FILENAME_REGEX = /^(\d{4}-\d{2}-\d{2})(?:-(\d{4}))?-(.+)\.md$/

export type BulkParseResult =
	| { ok: true; datetime: string; title: string }
	| { ok: false; reason: string }

/**
 * Parses a bulk-import filename into a `datetime` (`yyyy-MM-dd-HHmm`) and a
 * literal `title`. Defaults the time component to `0000` when omitted. Returns
 * a `{ ok: false, reason }` shape — callers surface the reason verbatim in the
 * per-file result panel so the admin knows which file to rename.
 */
export function parseBulkImportFilename(filename: string): BulkParseResult {
	const match = filename.match(FILENAME_REGEX)

	if (!match) {
		return {
			ok: false,
			reason: "Filename must be `yyyy-MM-dd[-HHmm]-Title.md`",
		}
	}

	const [, date, time, title] = match
	const trimmedTitle = title.trim()

	if (trimmedTitle === "") {
		return { ok: false, reason: "Title is empty" }
	}

	if (!isValidDate(date)) {
		return { ok: false, reason: "Invalid date" }
	}

	if (time != null && !isValidTime(time)) {
		return { ok: false, reason: "Invalid time (must be 0000-2359)" }
	}

	return {
		ok: true,
		datetime: `${date}-${time ?? "0000"}`,
		title: trimmedTitle,
	}
}

function isValidDate(date: string): boolean {
	// Round-trip parse — rejects 2026-02-31, 2026-13-01, etc., that the regex
	// passes but the calendar doesn't.
	const [year, month, day] = date.split("-").map((s) => Number.parseInt(s, 10))
	const d = new Date(year, month - 1, day)

	return (
		d.getFullYear() === year &&
		d.getMonth() === month - 1 &&
		d.getDate() === day
	)
}

function isValidTime(time: string): boolean {
	const hours = Number.parseInt(time.slice(0, 2), 10)
	const minutes = Number.parseInt(time.slice(2, 4), 10)

	return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}
