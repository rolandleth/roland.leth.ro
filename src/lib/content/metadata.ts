import { blankToNull } from "@/lib/utils/format"
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

/**
 * The social card used by every page that carries no image of its own.
 *
 * `card: "summary_large_image"` above promises a 1200×630 image. Without a
 * fallback the promise went unkept on every imageless surface — the landing
 * page, `not-found`, `/about`, `/guides`, `/projects`, the section indexes, the
 * privacy pages, the loan calculator, and any post or project with no asset —
 * which renders as a degraded card rather than a small one.
 *
 * A committed file, not a render: `scripts/generate-og-card.tsx` draws the
 * artwork, so the bytes shipped here depend on no font CDN and no Satori
 * version at request time. Regenerate with `yarn og:card` and commit the
 * result; `yarn og:card --check` compares without writing.
 */
export const defaultOgImage = "/images/og-card.png"

/**
 * The card's dimensions, single-sourced. `scripts/generate-og-card.tsx` renders
 * at this size, `metadata.test.ts` reads the committed PNG's IHDR header and
 * asserts it, and the descriptor below advertises it — three places that would
 * otherwise drift silently, since a wrong-size card degrades every preview on
 * the site while leaving the markup perfectly well-formed.
 */
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

/**
 * `defaultOgImage` in descriptor form, so the card advertises its own size and
 * carries alt text.
 *
 * The dimensions let a scraper pick the large-card layout without fetching the
 * bytes first; the alt is what a screen reader announces for a shared link, and
 * without it every page on the site shares an unlabelled image.
 *
 * Only the default gets this treatment. A page-supplied image is an arbitrary
 * Blob upload of unknown size with no stored description — stamping 1200×630 on
 * it would assert a dimension that isn't true, and reusing the page title as
 * `alt` would describe the page rather than the picture. Omitting both is the
 * honest option there.
 */
const defaultOgImageDescriptor = {
	url: defaultOgImage,
	width: OG_IMAGE_WIDTH,
	height: OG_IMAGE_HEIGHT,
	// Matches what the card actually draws — see `scripts/generate-og-card.tsx`.
	alt: "Roland Leth — iOS developer & full-stack engineer",
} as const

/**
 * The `images` entry for a resolved image: the full descriptor when it's the
 * site default, a bare URL otherwise. Built fresh per call rather than shared,
 * so `openGraph` and `twitter` never alias one object.
 */
export function ogImageEntry(image: string) {
	return image === defaultOgImage
		? { ...defaultOgImageDescriptor }
		: { url: image }
}

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
	// `image: null` means "this page has no asset", not "this page opts out of a
	// card", so both null and absent fall through to the site-wide default. A
	// page that genuinely wants no image would need an explicit opt-out; none
	// does today, and shipping a large-image card with nothing in it is the
	// failure mode this replaces.
	//
	// `blankToNull` first, not a bare `??`: the parameter is typed `string |
	// null`, so `""` type-checks, and `"" ?? defaultOgImage` is `""` — which
	// `metadataBase` resolves to the site root, making the card an HTML
	// document. Strictly worse than the imageless card the default exists to
	// fix, and silent.
	const resolvedImage = blankToNull(image) ?? defaultOgImage

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
			// Built twice rather than sharing one array instance between the two
			// keys: the aliasing is invisible at both call sites, and any future
			// per-surface normalization would silently apply to both.
			images: [ogImageEntry(resolvedImage)],
		},
		twitter: {
			...siteTwitter,
			title: ogTitle,
			description,
			images: [ogImageEntry(resolvedImage)],
		},
	}
}
