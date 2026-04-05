import readingTime from "reading-time"

/**
 * Parses a string into a positive integer, returning `null` if invalid.
 */
export function parseIntId(raw: string): number | null {
	const n = parseInt(raw, 10)
	return isNaN(n) ? null : n
}

/**
 * Parses a `yyyy-MM-dd-HHmm` datetime string into a human-readable date.
 */
export function formatDate(datetime: string): string {
	const match = datetime.match(/(\d{4})-(\d{2})-(\d{2})/)

	if (!match) {
		return datetime
	}

	const [, year, month, day] = match
	const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))

	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	})
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

	if (t.minutes <= 0.2) return ""
	if (t.minutes <= 0.5) return "25 sec read"
	if (t.minutes <= 0.8) return "45 sec read"

	return t.text
}

/**
 * Truncates a raw markdown body at a paragraph boundary near 700 chars,
 * but only if the body exceeds 900 chars. Returns the text and whether
 * it was truncated (to decide whether to show "Continue reading").
 */
export function truncateBody(body: string): {
	text: string
	isTruncated: boolean
} {
	if (body.length < 900) {
		return { text: body, isTruncated: false }
	}

	const candidate = body.slice(0, 700)
	const lastBreak = candidate.lastIndexOf("\n\n")
	const cutPoint = lastBreak > 0 ? lastBreak : 700

	const slicedText = body.slice(0, cutPoint)
	// If the excerpt contains a heading block, trim before that heading so it
	// isn't shown without the content that follows it.
	const lastHeadingBreak = slicedText.lastIndexOf("\n\n#")
	const finalCutPoint = lastHeadingBreak > 0 ? lastHeadingBreak : cutPoint

	return { text: body.slice(0, finalCutPoint), isTruncated: true }
}
