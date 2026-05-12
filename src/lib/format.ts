import readingTime from "reading-time"

// Anchored so `postDatetimeToISO` doesn't silently accept a string with
// leading or trailing garbage around a valid-looking date. `formatDate` uses
// the same regex so falls back to returning the raw input on non-match.
const DATETIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?$/

// Strict so trailing garbage (`"12abc"`) is rejected — `Number.parseInt` would
// silently return `12` and let `/admin/posts/12abc/edit` resolve to id=12.
const INT_ID_REGEX = /^-?\d+$/

/**
 * Parses a string into an integer, returning `null` if invalid (including
 * trailing non-digit characters).
 */
export function parseIntId(raw: string): number | null {
	if (!INT_ID_REGEX.test(raw)) {
		return null
	}

	const n = Number.parseInt(raw, 10)

	return Number.isNaN(n) ? null : n
}

// Upper bound is generous (10k pages × PAGE_SIZE=12 = 120k posts) so legitimate
// pagination is never clipped, while still rejecting `?page=999999999` which
// would translate to a wasted Postgres `OFFSET` scan.
const MAX_PAGE = 10_000

/**
 * Parses a `?page=` query value into a positive integer in `[1, MAX_PAGE]`,
 * defaulting to `1` on invalid input.
 */
export function parsePageParam(raw: string | undefined | null): number {
	const n = Number.parseInt(raw ?? "1", 10)

	if (Number.isNaN(n) || n < 1) {
		return 1
	}

	return Math.min(n, MAX_PAGE)
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
 * Returns `null` on malformed input — callers should omit the
 * dependent attribute (e.g. `<time dateTime>`) or skip the field rather
 * than 500ing the surrounding render. Schema regex on writes catches the
 * common case; legacy DB rows are the practical path to malformed input.
 */
export function postDatetimeToISO(datetime: string): string | null {
	const match = datetime.match(DATETIME_REGEX)

	if (!match) {
		console.warn("[format:postDatetimeToISO] invalid datetime", { datetime })

		return null
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
 *
 * Steps: decompose accents (`é` → `e`), strip combining marks, drop punctuation,
 * map `&` to `and`, replace whitespace/dots/dashes with `-`, lowercase, then
 * collapse repeated `-` and trim leading/trailing `-`.
 */
export function createSlug(title: string): string {
	return (
		title
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			.replace(/['"#,;!:?[\]{}($/)]+/g, "")
			.replace(/&/g, "and")
			// Dash-equivalents folded into a single ASCII hyphen. `‐-―` covers
			// the typographic hyphens/dashes (hyphen, non-breaking hyphen,
			// figure dash, en dash, em dash, horizontal bar). `−` U+2212 is the
			// math minus sign and `­` U+00AD is the soft hyphen — both pass
			// NFKD unchanged and previously survived to the slug, producing
			// technically-valid-but-weird URLs.
			.replace(/[\s.‐-―−­]+/g, "-")
			.toLowerCase()
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "")
	)
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
