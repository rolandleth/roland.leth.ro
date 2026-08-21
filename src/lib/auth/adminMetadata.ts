import { errorDetails } from "@/lib/utils/errorMessage"
import { parseIntId } from "@/lib/utils/format"
import { verifySession } from "./auth"
import { bypassIdForRequest, logMiddlewareBypass } from "./middlewareBypass"
import type { Metadata } from "next"

/**
 * Every admin edit page's log tag, as a closed set.
 *
 * A const map rather than four bare string literals at the call sites: the tag
 * is what attributes a security line to a page, and a hand-typed literal can be
 * copy-pasted between pages with nothing failing. `adminPageContract.test.ts`
 * walks the edit-page directory against this map, so a fifth page can't ship
 * without an entry. (Not `adminAuthContract.test.ts` — that file exists and
 * does the same job one namespace over, for `/api/admin`.)
 */
export const ADMIN_EDIT_TAGS = {
	posts: "[admin:posts:edit]",
	projects: "[admin:projects:edit]",
	guides: "[admin:guides:edit]",
	guideTopics: "[admin:guide-topics:edit]",
} as const

export type AdminEditTag =
	(typeof ADMIN_EDIT_TAGS)[keyof typeof ADMIN_EDIT_TAGS]

interface AdminEditMetadataOptions {
	/**
	 * Page-identifying log tag. Constrained to `ADMIN_EDIT_TAGS` so a page can't
	 * ship a line attributed to a different one — with four positional `string`
	 * parameters, transposing two compiled clean.
	 */
	tag: AdminEditTag
	/** Raw `params.id`, unparsed. */
	id: string
	/** Browser title when the name can't be resolved. */
	fallback: string
	/** Loads the record's display name, or `null` when there is no such record. */
	loadName: (recordId: number) => Promise<string | null>
}

/**
 * Builds the `Edit: <name>` browser title for an admin edit page, falling back
 * to `fallback` when the request carries no valid session, the id is
 * unparseable, or the record is missing.
 *
 * This is an auth gate, not a titling helper. `generateMetadata` runs
 * independently of `admin/(protected)/layout.tsx`, so the layout's session check
 * does not cover it: a request that slips past the `src/proxy.ts` matcher would
 * otherwise reach `loadName`, read the row, and render an unpublished post or
 * project's name into the `<title>` of a page it was never allowed to see. The
 * fallback title is the point — the log line only tells you it happened.
 *
 * Shared across the edit pages so a fifth one can't ship without the guard.
 * `loadName` runs only for an authenticated request carrying a parseable id.
 */
export async function adminEditMetadata({
	tag,
	id,
	fallback,
	loadName,
}: AdminEditMetadataOptions): Promise<Metadata> {
	// Session first, id second — the reverse of the obvious ordering, which
	// parsed first so a garbage id short-circuited without paying for a cookie
	// read and a JWT verify. That saving cost the signal: an unauthenticated
	// request with a non-numeric id returned early and emitted no page-tagged
	// line, which is exactly the shape a fuzzer probing for a matcher hole
	// sends. `[admin:layout]` still caught the event, but without page
	// granularity. An HMAC verify on a path the middleware already handles in
	// normal operation is worth the attribution.
	const isAuthenticated = await verifySession()

	if (!isAuthenticated) {
		logMiddlewareBypass(tag, "generateMetadata", { id })

		return { title: fallback }
	}

	const recordId = parseIntId(id)

	if (recordId === null) {
		return { title: fallback }
	}

	// A throwing loader (a transient DB error) would otherwise propagate out of
	// `generateMetadata` and 500 the page — the one failure mode here that
	// neither degrades to `fallback` nor leaves a trace. Logged rather than
	// swallowed: a title falling back to "Edit post" looks identical whether the
	// record is missing or the database is down.
	let name: string | null

	try {
		name = await loadName(recordId)
	} catch (error) {
		// Two arguments, not three, and carrying `bypassId` — the shape every
		// other line in this defence layer uses. A three-argument line with no
		// correlation id matched none of the alert greps built on the group, so a
		// database outage on an edit page produced a line nobody was watching.
		//
		// `errorDetails` rather than the raw `error`: `Error.message`/`.stack`
		// live on non-enumerable properties, so nesting the Error itself here
		// would serialize to `{}` — and drop the stack this line exists to
		// capture — under any log pipeline that JSON.stringifies before storage.
		// eslint-disable-next-line no-console
		console.error(`${tag} loadName failed`, {
			bypassId: bypassIdForRequest(),
			id,
			error: errorDetails(error),
		})

		return { title: fallback }
	}

	return { title: name ? `Edit: ${name}` : fallback }
}
