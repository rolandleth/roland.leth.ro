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
 * Guides sort by their authored `sortOrder` within a topic, then by title so
 * the order is total — `sortOrder` defaults to 0, so an unordered import would
 * otherwise come back in whatever order Postgres feels like, and the rendered
 * list would shuffle between requests.
 */
export const guideOrder = [
	{ sortOrder: "asc" as const },
	{ title: "asc" as const },
]
