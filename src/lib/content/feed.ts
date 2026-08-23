import { capitalizeSection, type Section } from "@/lib/db/sections"

/**
 * Feed identity helpers — one source of truth for the author name, the canonical
 * feed URL, and the human title, shared by the Atom document (`route.ts`) and
 * every autodiscovery `<link>` (layout, blog pages, landing). Kept together so a
 * rename can't leave the feed's own `<title>` disagreeing with the `<link
 * title>` a reader stores.
 */

/** Feed author, shown in the Atom `<title>`/`<author>` and every feed title. */
export const FEED_AUTHOR_NAME = "Roland Leth"

/**
 * Canonical, content-shaped feed URL for a section (path only — callers resolve
 * it against `metadataBase`, or prefix the origin for the Atom `rel="self"`).
 * The middleware rewrites it to `/api/feed/:section`.
 */
export function feedPathForSection(section: Section): string {
	return `/blog/${section}/feed.xml`
}

/**
 * Human-readable feed title. Emitted as the Atom `<title>` and as the `title`
 * attribute of the autodiscovery `<link>` — without the latter, feed readers
 * fall back to displaying the raw URL instead of a name.
 */
export function feedTitleForSection(section: Section): string {
	return `${FEED_AUTHOR_NAME} — ${capitalizeSection(section)} blog`
}

/**
 * The `{ path, title }` descriptor an autodiscovery `<link>` needs, so call
 * sites pass one value instead of re-pairing the URL and title every time.
 */
export function feedLinkForSection(section: Section): {
	path: string
	title: string
} {
	return {
		path: feedPathForSection(section),
		title: feedTitleForSection(section),
	}
}
