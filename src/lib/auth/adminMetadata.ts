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
 */
export async function adminEditMetadata(
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
		return { title: fallback }
	}

	const name = await loadName(recordId)

	return { title: name ? `Edit: ${name}` : fallback }
}
