import { parseIntId } from "@/lib/utils/format"
import { verifySession } from "./auth"
import type { Metadata } from "next"

/**
 * Builds the `Edit: <name>` browser title for an admin edit page, falling back
 * to `fallback` when the id is unparseable, the record is missing, or the
 * request carries no valid session.
 *
 * The session check lives here rather than in `admin/(protected)/layout.tsx`
 * because nested `generateMetadata` runs independently of the layout — a
 * request that slips past the `src/proxy.ts` matcher would otherwise reach
 * `loadName` and its DB read with no gate in front of it. Shared across the
 * edit pages so a fifth one can't ship without the guard.
 *
 * `loadName` runs only for an authenticated request carrying a parseable id.
 *
 * @param tag Page-identifying log tag, e.g. `[admin:posts:edit]`. Passed
 * explicitly rather than derived from `fallback` so editing a browser title
 * can't rename a log line.
 */
export async function adminEditMetadata(
	tag: string,
	id: string,
	fallback: string,
	loadName: (recordId: number) => Promise<string | null>
): Promise<Metadata> {
	const recordId = parseIntId(id)

	// Parsed first so a garbage id short-circuits without paying for a cookie
	// read and a JWT verify.
	if (recordId === null) {
		return { title: fallback }
	}

	const isAuthenticated = await verifySession()

	if (!isAuthenticated) {
		// Same reasoning as `requireAdmin`, which logs the equivalent condition on
		// `/api/admin/*`: the middleware redirects unauthenticated page requests to
		// the login screen, so this branch should be unreachable. A line here means
		// a request got past the `src/proxy.ts` matcher — a security event, and the
		// only signal that the matcher has a hole. Without it the page namespace
		// fails silently while the API namespace reports.
		// eslint-disable-next-line no-console
		console.error(
			`${tag} unauthenticated request reached generateMetadata — the middleware gate did not run for this path`
		)

		return { title: fallback }
	}

	const name = await loadName(recordId)

	return { title: name ? `Edit: ${name}` : fallback }
}
