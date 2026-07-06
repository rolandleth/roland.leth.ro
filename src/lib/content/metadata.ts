import type { Metadata } from "next"

export interface PageMetadataInput {
	title: string
	description?: string
	path: string
	image?: string | null
	publishedTime?: string
	type?: "article" | "website"
	keywords?: string[]
	/**
	 * When set, emits a `<link rel="alternate" type="text/markdown">` pointing at
	 * a plain-markdown view of the page (e.g. a blog post's `.md` export), so
	 * crawlers and AI systems can discover it without guessing the URL.
	 */
	markdownPath?: string
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
		type,
		keywords,
		markdownPath,
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

	return {
		title,
		description,
		keywords,
		alternates: markdownPath
			? { types: { "text/markdown": markdownPath } }
			: undefined,
		openGraph: {
			type: type ?? "website",
			title: ogTitle,
			description,
			url: path,
			publishedTime,
			images,
		},
		twitter: {
			title: ogTitle,
			description,
			images,
		},
	}
}
