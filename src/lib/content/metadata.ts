import type { Metadata } from "next"

/**
 * Site-wide `openGraph` fields, spread by both the root layout and every page
 * built here.
 *
 * They can't live in the layout alone. Next merges metadata one top-level key
 * at a time: a page that defines `openGraph` gets `resolveOpenGraph` called on
 * *its* object and the result assigned over the parent's, with the parent's
 * never passed in. (`other` is the lone key Next deep-merges.) So a layout
 * default reaches only the pages that define no `openGraph` at all — here, the
 * landing page, `not-found`, and admin. Every content page dropped these
 * silently until 2026-08-12.
 */
export const siteOpenGraph = {
	siteName: "Roland Leth",
	locale: "en_US",
} as const

/** The `twitter` half of the same story — see `siteOpenGraph`. */
export const siteTwitter = {
	card: "summary_large_image",
	creator: "@rolandleth",
} as const

export interface PageMetadataInput {
	title: string
	description?: string
	path: string
	image?: string | null
	publishedTime?: string
	/**
	 * `article:modified_time`. For maintained pages (guides), the freshness
	 * signal that matters — unlike a blog post, the publish date isn't the point.
	 */
	modifiedTime?: string
	type?: "article" | "website"
	keywords?: string[]
	/**
	 * When set, emits a `<link rel="alternate" type="text/markdown">` pointing at
	 * a plain-markdown view of the page (e.g. a blog post's `.md` export), so
	 * crawlers and AI systems can discover it without guessing the URL.
	 */
	markdownPath?: string
	/**
	 * When set, emits a `<link rel="alternate" type="application/atom+xml">` — the
	 * feed-autodiscovery link browsers and readers look for. The `title` is
	 * required, not optional: without it, readers list the feed by its raw URL
	 * instead of a name. Build it with `feedLinkForSection` so the title matches
	 * the Atom document's own `<title>`.
	 */
	feed?: { path: string; title: string }
	/**
	 * When set, emits `<link rel="canonical">` at this path (resolved against the
	 * layout's `metadataBase`). Opt-in rather than defaulted to `path`: it's only
	 * wired up for surfaces that get shared with tracking params attached, and
	 * turning it on everywhere at once would silently assert a canonical for
	 * pages nobody has audited for multi-path reachability.
	 */
	canonicalPath?: string
}

/**
 * Builds a `Metadata` object with consistent `openGraph` and `twitter` fields.
 * The root layout sets `metadataBase`, so relative `path` values resolve correctly.
 * `title` is passed as the plain page title and picks up the layout's
 * `"%s | Roland Leth"` template; `openGraph.title` is expanded here because
 * OG fields do not honor the template.
 *
 * If a page's `title` already contains "Roland Leth", do NOT route it through
 * here — use `title: { absolute: "..." }` directly so the layout template
 * doesn't double-brand the result (e.g. "Roland Leth — Foo | Roland Leth").
 * The landing page (`src/app/page.tsx`) is the canonical example.
 */
export function buildPageMetadata(input: PageMetadataInput): Metadata {
	const {
		title,
		description,
		path,
		image,
		publishedTime,
		modifiedTime,
		type,
		keywords,
		markdownPath,
		feed,
		canonicalPath,
	} = input

	// Dev-only guard: the JSDoc above warns about the double-brand pitfall,
	// but doc-only is regression-prone — a future caller passing a
	// pre-branded title would silently produce `"Roland Leth — Foo | Roland
	// Leth"` through the layout template. Throw in dev/test so the
	// regression surfaces during local work; silent in prod (no behavior
	// change for already-deployed callers if a slip ever shipped).
	if (process.env.NODE_ENV !== "production" && title.includes("Roland Leth")) {
		throw new Error(
			`[buildPageMetadata] title already contains "Roland Leth"; ` +
				`pass through \`title: { absolute: "..." }\` instead so the ` +
				`layout's "%s | Roland Leth" template does not double-brand. ` +
				`Got: ${JSON.stringify(title)}`
		)
	}

	const ogTitle = `${title} | Roland Leth`
	const images = image ? [image] : undefined

	// `canonical` and `types` are independent opt-ins, so the object is built up
	// rather than ternary'd on one of them — and stays `undefined` when none
	// apply, so callers that want none emit no `alternates` at all. `types`
	// itself holds two independent alternates (markdown export, feed
	// autodiscovery), so it's assembled the same way.
	const alternates: NonNullable<Metadata["alternates"]> = {}
	const types: NonNullable<NonNullable<Metadata["alternates"]>["types"]> = {}

	if (canonicalPath !== undefined) {
		alternates.canonical = canonicalPath
	}

	if (markdownPath !== undefined) {
		types["text/markdown"] = markdownPath
	}

	if (feed !== undefined) {
		// Array-of-descriptor form (not a bare string) so Next emits the `title`
		// attribute — the string form drops it, and readers then show the URL.
		types["application/atom+xml"] = [{ url: feed.path, title: feed.title }]
	}

	if (Object.keys(types).length > 0) {
		alternates.types = types
	}

	return {
		title,
		description,
		keywords,
		alternates: Object.keys(alternates).length > 0 ? alternates : undefined,
		openGraph: {
			...siteOpenGraph,
			type: type ?? "website",
			title: ogTitle,
			description,
			url: path,
			publishedTime,
			modifiedTime,
			images,
		},
		twitter: {
			...siteTwitter,
			title: ogTitle,
			description,
			images,
		},
	}
}
