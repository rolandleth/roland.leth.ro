import readingTime from "reading-time"

// Anchored so `postDatetimeToISO` doesn't silently accept a string with
// leading or trailing garbage around a valid-looking date. `formatDate` uses
// the same regex so falls back to returning the raw input on non-match.
const DATETIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?$/

/**
 * Parses a string into an integer, returning `null` if invalid.
 */
export function parseIntId(raw: string): number | null {
	const n = Number.parseInt(raw, 10)

	return Number.isNaN(n) ? null : n
}

/**
 * Parses a `?page=` query value into a positive integer, defaulting to `1` on invalid input.
 */
export function parsePageParam(raw: string | undefined | null): number {
	const n = Number.parseInt(raw ?? "1", 10)

	if (Number.isNaN(n) || n < 1) {
		return 1
	}

	return n
}

/**
 * Parses a `yyyy-MM-dd-HHmm` datetime string into a human-readable date.
 */
export function formatDate(datetime: string): string {
	const match = datetime.match(DATETIME_REGEX)

	if (!match) {
		return datetime
	}

	const [, year, month, day] = match
	const date = new Date(
		Number.parseInt(year, 10),
		Number.parseInt(month, 10) - 1,
		Number.parseInt(day, 10)
	)

	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	})
}

/**
 * Parses a `yyyy-MM-dd-HHmm` datetime string into an ISO 8601 string.
 * Throws on malformed input so callers don't silently render a bad date.
 */
export function postDatetimeToISO(datetime: string): string {
	const match = datetime.match(DATETIME_REGEX)

	if (!match) {
		throw new Error(`Invalid post datetime: ${datetime}`)
	}

	const [, year, month, day, hours, minutes] = match
	const date = new Date(
		Number.parseInt(year, 10),
		Number.parseInt(month, 10) - 1,
		Number.parseInt(day, 10),
		hours ? Number.parseInt(hours, 10) : 0,
		minutes ? Number.parseInt(minutes, 10) : 0
	)

	return date.toISOString()
}

/**
 * Returns the year portion of a `yyyy-MM-dd-HHmm` datetime string.
 */
export function yearFromDatetime(datetime: string): string {
	return datetime.slice(0, 4)
}

/**
 * Returns the current time as a `yyyy-MM-dd-HHmm` string, for
 * comparing against the `datetime` field to filter out future posts.
 */
export function currentDatetimeString(): string {
	const now = new Date()
	const year = now.getFullYear()
	const month = String(now.getMonth() + 1).padStart(2, "0")
	const day = String(now.getDate()).padStart(2, "0")
	const hours = String(now.getHours()).padStart(2, "0")
	const minutes = String(now.getMinutes()).padStart(2, "0")

	return `${year}-${month}-${day}-${hours}${minutes}`
}

/**
 * Converts a post title into a URL-safe slug.
 * Ported from `Post.createLink()` in the old blog.
 */
export function createSlug(title: string): string {
	return title
		.replace(/(['"#,;!:?[\]{}($/)]+)/g, "")
		.replace(/&/g, "and")
		.replace(/\s|\./g, "-")
		.toLowerCase()
}

/**
 * Computes a human-readable reading time string from raw markdown body.
 * Ported from `timeToRead()` in the old blog.
 */
export function calculateReadingTime(body: string): string {
	const t = readingTime(body)

	if (t.minutes <= 0.2) {
		return ""
	}

	if (t.minutes <= 0.5) {
		return "25 sec read"
	}

	if (t.minutes <= 0.8) {
		return "45 sec read"
	}

	return t.text
}

const TRUNCATE_MIN_LENGTH = 900
const TRUNCATE_TARGET_LENGTH = 700

/**
 * Truncates a raw markdown body at a paragraph boundary near `TRUNCATE_TARGET_LENGTH` chars,
 * but only if the body exceeds `TRUNCATE_MIN_LENGTH` chars. Returns the text and whether
 * it was truncated (to decide whether to show "Continue reading").
 */
export function truncateBody(body: string): {
	text: string
	isTruncated: boolean
} {
	if (body.length < TRUNCATE_MIN_LENGTH) {
		return { text: body, isTruncated: false }
	}

	const candidate = body.slice(0, TRUNCATE_TARGET_LENGTH)
	const lastBreak = candidate.lastIndexOf("\n\n")
	const cutPoint = lastBreak > 0 ? lastBreak : TRUNCATE_TARGET_LENGTH

	const slicedText = body.slice(0, cutPoint)
	// Trim before a heading block so we don't show the heading without its content.
	const lastHeadingBreak = slicedText.lastIndexOf("\n\n#")
	const finalCutPoint = lastHeadingBreak > 0 ? lastHeadingBreak : cutPoint

	return { text: body.slice(0, finalCutPoint), isTruncated: true }
}
