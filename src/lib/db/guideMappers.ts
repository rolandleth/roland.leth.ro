// Next-free guide helpers. Lives outside `guides.ts` for the same reason
// `projectMappers.ts` lives outside `projects.ts`: that module imports
// `next/cache`, which the import script can't pull in. Everything here is pure,
// so the admin write routes and `scripts/import-guides.ts` share one set of
// rules instead of reimplementing them on each side.

/**
 * The `publishedAt` value to persist, given the row's current value and the
 * publish state being written. Set once on first publish and never rewritten:
 * it feeds JSON-LD `datePublished`, so an unpublish/republish cycle (staging a
 * fix, say) must not reset the page's age and make an established guide look
 * brand new to a crawler. Returns `undefined` when the column should be left
 * untouched, matching the "only send changed fields" shape the update paths use.
 *
 * The ADMIN path only. An imported guide's `publishedAt` comes from its
 * filename's date prefix and re-syncs on every overwrite (see `guideImport.ts`),
 * because there it's a date the author chose and can change. Here there's no
 * file to read it from, so it's an artifact of when Publish was clicked — which
 * is exactly why it must be stamped once and then left alone.
 */
export function resolvePublishedAt(
	current: Date | null,
	nextPublished: boolean | undefined,
	now: Date
): Date | undefined {
	if (nextPublished !== true || current != null) {
		return undefined
	}

	return now
}

/**
 * True when a guide is published but its date hasn't arrived yet — in the
 * database, deliberately not live. Mirrors `isFutureDatetime` for posts, and
 * every public read path filters on it.
 *
 * `now` is a REQUIRED argument, same contract as `isFutureDatetime`: a list must
 * not have rows disagreeing about what "now" is, so multi-item callers capture
 * it once, and tests can pin it without mocking the clock.
 *
 * A null `publishedAt` is never scheduled. It means "published with no recorded
 * date" (reachable for an admin-created row whose publish flag was set outside
 * the normal path), and the safe reading of a missing date is *live* — treating
 * it as scheduled would silently hide a page that's supposed to be up, which is
 * the one failure this whole mechanism exists to avoid.
 */
export function isScheduledGuide(publishedAt: Date | null, now: Date): boolean {
	if (publishedAt == null) {
		return false
	}

	// `unstable_cache` round-trips through JSON, so this can arrive as an ISO
	// string despite the type. `new Date` on a Date is a harmless clone.
	return new Date(publishedAt).getTime() > now.getTime()
}

/**
 * Guides sort by their authored `sortOrder` within a topic, then by title so
 * the order is total — `sortOrder` defaults to 0, so an unordered import would
 * otherwise come back in whatever order Postgres feels like, and the rendered
 * list would shuffle between requests.
 *
 * `compareGuides` below MUST encode the same ordering: the overview regroups
 * guides in memory and re-sorts the ungrouped remainder with the comparator, so
 * if the two drift the in-memory list orders differently from every DB-ordered
 * list. Kept side by side (and pinned together in `guideMappers.test.ts`) so a
 * change to one is an obvious prompt to change the other.
 */
export const guideOrder = [
	{ sortOrder: "asc" as const },
	{ title: "asc" as const },
]

/**
 * In-memory twin of `guideOrder`, for lists re-sorted after the overview regroups
 * them (Postgres can't order the regrouped set). Typed structurally so this stays
 * Next-free; any row with `sortOrder` + `title` (e.g. `GuideListItem`) fits.
 */
export function compareGuides(
	a: { sortOrder: number; title: string },
	b: { sortOrder: number; title: string }
): number {
	return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)
}
