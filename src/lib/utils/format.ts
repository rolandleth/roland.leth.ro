import readingTime from "reading-time"
import { PAGE_SIZE } from "@/lib/utils/pagination"

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

/**
 * Collapses a blank string (empty or whitespace-only) to `null`, so `??` chains
 * and `!= null` checks treat "absent" and "present but empty" the same way.
 *
 * The image columns and `imageUrl` are typed `string | null` and the write-path
 * Zod schemas reject `""`, but the types alone admit it and the difference is
 * invisible at a `??` call site: `"" ?? fallback` is `""`. Normalizing at the
 * boundary keeps a blank from being carried forward as if it were a real value.
 */
export function blankToNull(value: string | null | undefined): string | null {
	if (value == null) {
		return null
	}

	const trimmed = value.trim()

	return trimmed === "" ? null : trimmed
}

/**
 * Hard ceiling on a page number reaching a route, ahead of any database work.
 *
 * `page` arrives from a URL segment, so a crawler can walk it freely. At 10_000
 * (the previous value) every step was a billed on-demand render running a
 * `findMany` with `skip` up to 99_990 plus a `count`, each minting its own
 * on-disk cache entry — roughly 10k probes' worth of real work behind a bound
 * that existed only to stop `OFFSET` scans.
 *
 * 30 × `PAGE_SIZE` = 300 posts, comfortably above the current corpus and small
 * enough that the whole probe surface is cheap. `parsePageParam` clamps rather
 * than rejects; `/blog/:section/p/:page` compares the clamped value against the
 * raw segment, so anything above this 404s before a query runs. That round-trip
 * check is that route's job, not this function's — a caller that skips it
 * renders page 1 for garbage input instead of 404ing. `parseAdminPageParam`,
 * below, is not such a caller: it's a separate function with no clamp at all,
 * not a wrapper around this one.
 *
 * This is the OUTER guard, not the exact one — the exact bound is the section's
 * real `totalPages`, checked at the route after a cached count. Raising the
 * corpus past 300 posts fails the build rather than 404ing a real page: see the
 * ceiling assertion in `generateStaticParams` for the paginated blog route.
 *
 * Public/crawlable routes only. Admin pagination uses `parseAdminPageParam`
 * instead — see there for why the same ceiling doesn't apply.
 */
export const MAX_PAGE = 30

/**
 * Parses a page value into a positive integer in `[1, MAX_PAGE]`, defaulting to
 * `1` on invalid input.
 *
 * Clamping (rather than returning `null`) is what lets callers do a round-trip
 * check — `String(parsed) !== raw` rejects junk, padding, and out-of-range in
 * one comparison. A caller that skips that check renders page 1 for garbage
 * input, so every route boundary has to do it.
 */
export function parsePageParam(raw: string | undefined | null): number {
	const n = Number.parseInt(raw ?? "1", 10)

	if (Number.isNaN(n) || n < 1) {
		return 1
	}

	return Math.min(n, MAX_PAGE)
}

/**
 * The largest `page` whose `skip` (`(page - 1) * PAGE_SIZE`) still fits a
 * signed 32-bit integer — the width Postgres/the `pg` driver bind an
 * `OFFSET` parameter to by default. Not a probe-cost ceiling like `MAX_PAGE`
 * (see `parseAdminPageParam`'s docblock for why that one doesn't apply here);
 * this exists only so a page number past it fails predictably instead of
 * whatever an overflowed bind parameter does.
 */
export const MAX_SAFE_ADMIN_PAGE = Math.floor((2 ** 31 - 1) / PAGE_SIZE)

/**
 * Parses a page value into a positive integer, defaulting to `1` on invalid
 * input. No probe-cost ceiling, unlike `parsePageParam`.
 *
 * `MAX_PAGE` exists to bound the probe surface of a public, crawlable route —
 * admin sits behind auth, for a single user, so that cost doesn't apply. Each
 * admin tab already computes its own real `totalPages` from the same query
 * that fetches the page (`listPostsForAdmin` and siblings), and a `page` past
 * it just renders an empty list via `skip`/`take` — there's no query-less
 * ceiling to protect here the way the blog route protects one.
 *
 * Still clamped to `MAX_SAFE_ADMIN_PAGE`, though: that bound isn't about probe
 * cost, it's about not handing Prisma a `skip` that overflows a 32-bit bind
 * parameter. Realistic impact is a self-inflicted error from a hand-edited
 * URL, not anything a real corpus reaches — but "no bound at all" was one
 * hand-typed digit away from it.
 */
export function parseAdminPageParam(raw: string | undefined | null): number {
	const n = Number.parseInt(raw ?? "1", 10)

	if (Number.isNaN(n) || n < 1) {
		return 1
	}

	return Math.min(n, MAX_SAFE_ADMIN_PAGE)
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
 * Formats a `Date` as a human-readable day, in the same shape as `formatDate`
 * ("Jul 17, 2026").
 *
 * Deliberately NOT sharing an implementation with `formatDate`, despite the
 * identical output shape. A post's `yyyy-MM-dd` is a calendar day by
 * construction — `formatDate` builds a local midnight from its parts, so the
 * day it renders is the day that was authored, whatever the zone. A guide's
 * `updatedAt` is an *instant*, so it needs `timeZone: "UTC"` pinned or a build
 * at 23:30Z would render one day locally and another on Vercel — and the same
 * value goes out as JSON-LD `dateModified`, where a visible/structured
 * disagreement is a real inconsistency. Folding these together would silently
 * shift every post's date by a day in any zone behind UTC.
 */
export function formatDateValue(date: Date): string {
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	})
}

/**
 * Parses a `yyyy-MM-dd-HHmm` datetime string into a `Date` at that instant in
 * UTC, or null when it doesn't parse.
 *
 * UTC, where `postDatetimeToISO` below builds a local `Date`, because this one
 * feeds a real `DateTime` column (`Guide.publishedAt`) instead of being rendered
 * back through the same local lens it was built with. A post stores its string
 * and formats it locally on both sides, so the two cancel out. A guide's
 * `2026-07-13-0000` built locally in UTC+2 would persist as 2026-07-12T22:00Z,
 * and `formatDateValue` — UTC-pinned, like every guide dateline — would then
 * render it a day early, disagreeing with the filename that authored it.
 */
export function datetimeToUtcDate(datetime: string): Date | null {
	const match = datetime.match(DATETIME_REGEX)

	if (!match) {
		return null
	}

	const [, year, month, day, hours, minutes] = match

	return new Date(
		Date.UTC(
			Number.parseInt(year, 10),
			Number.parseInt(month, 10) - 1,
			Number.parseInt(day, 10),
			hours ? Number.parseInt(hours, 10) : 0,
			minutes ? Number.parseInt(minutes, 10) : 0
		)
	)
}

/**
 * Parses a `yyyy-MM-dd-HHmm` datetime string into an ISO 8601 string.
 * Returns `undefined` on malformed input — `undefined` (not `null`) so
 * callers can pass the result straight into React props / Next.js
 * `Metadata` fields without a `?? undefined` shim. Schema regex on writes
 * catches the common case; legacy DB rows are the practical path to
 * malformed input.
 */
export function postDatetimeToISO(datetime: string): string | undefined {
	const match = datetime.match(DATETIME_REGEX)

	if (!match) {
		// eslint-disable-next-line no-console
		console.warn("[format:postDatetimeToISO] invalid datetime", { datetime })

		return undefined
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
 * Returns a time as a `yyyy-MM-dd-HHmm` string, for comparing against the
 * `datetime` field to filter out future posts.
 *
 * `at` defaults to now. Pass an explicit `Date` to express an offset from now
 * in the same local-time frame — the scheduled-post cron builds its lower
 * window bound this way. Local, not UTC, because `datetime` values are authored
 * and compared locally throughout (see `datetimeToUtcDate` for the one place
 * that deliberately differs, and why).
 */
export function currentDatetimeString(at: Date = new Date()): string {
	const year = at.getFullYear()
	const month = String(at.getMonth() + 1).padStart(2, "0")
	const day = String(at.getDate()).padStart(2, "0")
	const hours = String(at.getHours()).padStart(2, "0")
	const minutes = String(at.getMinutes()).padStart(2, "0")

	return `${year}-${month}-${day}-${hours}${minutes}`
}

/**
 * Returns `true` if `datetime` is strictly later than `now`, computed as a
 * lexicographic string compare. Load-bearing invariant: the `yyyy-MM-dd-HHmm`
 * format is fixed-width and zero-padded, so the lexicographic order matches
 * the chronological order — `"2026-01-01-0900" < "2026-01-01-1000"` works.
 *
 * `now` is a required argument (rather than defaulting to
 * `currentDatetimeString()`) so callers that iterate multiple datetimes
 * capture one `now` rather than re-reading the clock per item, and so tests
 * can pin "now" without having to mock around the intra-module call.
 *
 * Callers (bulk import, the admin PostsTab scheduled marker) all depend on this
 * invariant; centralized here so a future format change can't quietly desync
 * them. The blog list's own scheduled-post filter is NOT a caller — it moved
 * into SQL as `publishedWhere`, where Postgres does the same compare on the
 * same fixed-width column.
 */
export function isFutureDatetime(datetime: string, now: string): boolean {
	return datetime > now
}

/**
 * Converts a post title into a URL-safe slug.
 * Ported from `Post.createLink()` in the old blog.
 *
 * Steps: decompose accents via NFKD (`é` → `e`) and strip the combining marks,
 * spell out `&`, fold whitespace/dots/the whole dash family into a single `-`,
 * lowercase, then keep ONLY URL-safe characters. That last step is a whitelist
 * (`[^a-z0-9-]`), not a hand-listed blacklist — so ALL punctuation is stripped,
 * including the typographic quotes (`’ ‘ “ ”`) a fixed list would miss and that
 * NFKD doesn't decompose. Finally collapse repeated `-` and trim.
 */
export function createSlug(title: string): string {
	return (
		title
			// NFKD splits an accented letter into base + combining mark
			// (`é` → `e` + ` ́`). The ASCII base survives; the mark is stripped
			// by the URL-safe whitelist below, so no separate mark-removal step.
			.normalize("NFKD")
			.replace(/&/g, "and")
			// Dash-equivalents folded into a single ASCII hyphen. Unicode
			// escapes (rather than literals) so the invisible soft hyphen
			// (U+00AD) doesn't look like a typo to a future reader.
			//   ‐-― — hyphen, non-breaking hyphen, figure dash,
			//                   en dash, em dash, horizontal bar
			//   −        — math minus sign
			//   ­        — soft hyphen
			// This runs before the whitelist so separators become `-` rather
			// than being stripped (which would merge adjacent words).
			.replace(/[\s.‐-―−­]+/g, "-")
			.toLowerCase()
			// Keep only URL-safe characters. A whitelist rather than an
			// enumerated punctuation blacklist, so anything not `[a-z0-9-]` —
			// typographic quotes, symbols, undecomposed letters — is dropped
			// instead of leaking a raw `’`/`@`/`%` into the slug. Runs after the
			// dash-fold (so `-` survives) and before the collapse (so a char
			// removed from between two dashes doesn't leave a `--`).
			.replace(/[^a-z0-9-]/g, "")
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
