// Which admin uploads nothing references any more, for `scripts/prune-uploads.ts`.
//
// `POST /api/admin/upload` writes every admin image — a post's image, a project's
// icon, card, OG and hero images, section images — to the store root as
// `<uuid>-<sanitized name>`, and nothing ever deletes one. Replacing or removing
// an image, or deleting the row, orphans the blob. This decides which to delete;
// the script does the I/O.
//
// A sweep rather than a delete on each write: one upload is routinely referenced
// twice (`cardImage` and `ogImage` fall back to each other, and a URL can be
// pasted into any markdown body), and a project delete cascades its section
// images away with no hook to run. A per-write delete would need a check across
// every table in every write route, and would leave the existing backlog alone.
//
// Pure, so every branch is testable without a store or a database.

import type { ListedBlob } from "@/lib/import/blobSync"

/**
 * How long a fresh upload is exempt. An image picked in a form but not saved yet
 * is unreferenced by definition, and a sweep that ran mid-edit would delete it.
 * A day is far past any real editing session.
 */
export const UPLOAD_GRACE_PERIOD_HOURS = 24

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000

const UUID_PATTERN =
	"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

/** Length of the `<uuid>` that opens every admin upload key. */
const UUID_LENGTH = 36

/**
 * The key shape the upload route writes: `randomUUID()`, a hyphen, then
 * `sanitizeFilename`'s output, which keeps only `[a-zA-Z0-9._-]` and can be empty.
 * No `/`, so it's always at the store root. Anything else in the store — the
 * project importer's `projects/<slug>/` keys, files added by hand — is never a
 * candidate.
 */
const ADMIN_UPLOAD_KEY = new RegExp(`^${UUID_PATTERN}-[a-zA-Z0-9._-]*$`)

/**
 * Global and case-insensitive, for scanning text. `matchAll` clones the regex, so
 * sharing this one instance across calls carries no `lastIndex` state.
 */
const UUID_IN_TEXT = new RegExp(UUID_PATTERN, "gi")

export function isAdminUploadKey(pathname: string): boolean {
	return ADMIN_UPLOAD_KEY.test(pathname)
}

/**
 * Every UUID that appears anywhere in `rows`, lowercased: every string value,
 * walked through nested arrays and objects so JSON columns count too.
 *
 * Matching an upload by its UUID rather than by parsing its URL is deliberate.
 * The UUID makes each key unique, and finding it anywhere survives what breaks a
 * URL parser: a full stop after a link in prose, an escaped underscore in the
 * name, a query string, a custom domain in front of the store. The only possible
 * error is keeping an orphan whose UUID happens to appear elsewhere, which for a
 * random UUID doesn't happen — and for a delete that can't be undone, keeping is
 * the direction to err in.
 */
export function collectReferencedUploadIds(
	rows: Iterable<unknown>
): Set<string> {
	const ids = new Set<string>()

	for (const row of rows) {
		collectIdsFrom(row, ids)
	}

	return ids
}

export type UploadPrunePlan = {
	/** Named somewhere in the database: kept. */
	referenced: ListedBlob[]
	/** Unreferenced, but inside the grace period, so possibly in an unsaved form: kept. */
	recent: ListedBlob[]
	/** Unreferenced and past the grace period: what `--apply` deletes. */
	unreferenced: ListedBlob[]
}

/**
 * Sorts the store's admin uploads into the three buckets. Blobs of any other
 * shape are left out entirely. A referenced upload counts as referenced however
 * recent it is.
 */
export function planUploadPrune(
	blobs: readonly ListedBlob[],
	referencedIds: ReadonlySet<string>,
	now: Date
): UploadPrunePlan {
	const plan: UploadPrunePlan = { referenced: [], recent: [], unreferenced: [] }
	const graceCutoff =
		now.getTime() - UPLOAD_GRACE_PERIOD_HOURS * MILLISECONDS_PER_HOUR

	for (const blob of blobs) {
		if (!isAdminUploadKey(blob.pathname)) {
			continue
		}

		if (referencedIds.has(uploadIdOf(blob))) {
			plan.referenced.push(blob)
		} else if (blob.uploadedAt.getTime() > graceCutoff) {
			plan.recent.push(blob)
		} else {
			plan.unreferenced.push(blob)
		}
	}

	return plan
}

/**
 * Why `--apply` must not delete this plan, or `null` when it may.
 *
 * It refuses when there is something to delete but the database references none
 * of the store's uploads. A live site always references some — post images,
 * project icons — so that combination almost always means the database and the
 * blob token point at different environments: a local or empty `DATABASE_URL`
 * with the production `BLOB_READ_WRITE_TOKEN`. Applying it would delete every
 * image on the site. The rare legitimate case, a store whose every upload really
 * is orphaned, is better cleared from the Vercel dashboard by hand.
 */
export function reasonToRefuseApply(plan: UploadPrunePlan): string | null {
	if (plan.unreferenced.length === 0 || plan.referenced.length > 0) {
		return null
	}

	return (
		`The database references none of the store's ${plan.unreferenced.length + plan.recent.length} uploads. ` +
		"That usually means DATABASE_URL and BLOB_READ_WRITE_TOKEN point at different environments " +
		"(or the database is empty), and applying would delete every image on the site. " +
		"Check both credentials. If every upload really is orphaned, delete them from the Vercel dashboard."
	)
}

/** The `<uuid>` an admin upload's key opens with. Callers check the key shape first. */
function uploadIdOf(blob: Pick<ListedBlob, "pathname">): string {
	return blob.pathname.slice(0, UUID_LENGTH)
}

function collectIdsFrom(value: unknown, ids: Set<string>): void {
	if (typeof value === "string") {
		for (const match of value.matchAll(UUID_IN_TEXT)) {
			ids.add(match[0].toLowerCase())
		}

		return
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			collectIdsFrom(item, ids)
		}

		return
	}

	// A Date carries no text worth scanning, and its own keys are empty anyway.
	if (value !== null && typeof value === "object" && !(value instanceof Date)) {
		for (const nested of Object.values(value)) {
			collectIdsFrom(nested, ids)
		}
	}
}
