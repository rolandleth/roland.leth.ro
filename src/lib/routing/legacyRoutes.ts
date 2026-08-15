// Legacy URL routing rules, consumed by `next.config.ts`.
//
// These lived in `src/proxy.ts` until they were moved here. Every rule is a
// pure pattern→pattern mapping with no request state, which is exactly what
// Next's `redirects()`/`rewrites()` express — and Vercel compiles those into
// its routing layer, where they cost no function invocation. `redirects()` also
// runs BEFORE middleware, so a legacy hit never reaches a function at all.
//
// The middleware keeps only what genuinely needs request state: the admin auth
// gate and the bot-probe short-circuit.
//
// `../db/sections` is imported relatively, not via the `@/` alias, because
// `next.config.ts` is loaded outside the app's module resolution and doesn't
// apply `tsconfig` path aliases.
import { SECTIONS } from "../db/sections"
import type { NextConfig } from "next"

type Redirects = Awaited<ReturnType<NonNullable<NextConfig["redirects"]>>>
type Rewrites = Awaited<ReturnType<NonNullable<NextConfig["rewrites"]>>>
type Rewrite = Extract<Rewrites, unknown[]>[number]

// Inlined into each `source` as a path-to-regexp param pattern, so adding a
// section to `SECTIONS` extends every rule below without touching them.
const SECTION_PATTERN = SECTIONS.join("|")

// Pinned explicitly so that reordering `SECTIONS` (e.g. adding a new section at
// position 0) doesn't silently redirect `/feed` to a different Atom feed for
// every existing subscriber.
const DEFAULT_FEED_SECTION = "tech"

/**
 * Legacy URL → canonical location. All permanent: these are the pre-restructure
 * URL shapes, and the redirect is what carries their SEO signal forward.
 *
 * Next appends the incoming query string to the destination automatically, so
 * analytics/share params (`?ref=`, `?utm_*`) survive without being restated.
 *
 * Note these emit 308, where the middleware emitted 301. Both are permanent;
 * 308 additionally preserves the request method, which for these GET-only URLs
 * is a distinction without a difference.
 */
export const LEGACY_REDIRECTS: Redirects = [
	{ source: "/privacy-policy", destination: "/privacy", permanent: true },

	// `/tech/blog/:slug` → `/blog/tech/:slug` (and the same for every other
	// section). `:slug+` requires at least one segment, so `/tech/blog/` still
	// falls through to a 404 rather than redirecting to a slugless URL.
	{
		source: `/:section(${SECTION_PATTERN})/blog/:slug+`,
		destination: "/blog/:section/:slug+",
		permanent: true,
	},
	{
		source: `/:section(${SECTION_PATTERN})/archive`,
		destination: "/blog/:section/archive",
		permanent: true,
	},
	{
		source: `/:section(${SECTION_PATTERN})/search`,
		destination: "/blog/:section/search",
		permanent: true,
	},
	{
		source: `/:section(${SECTION_PATTERN})`,
		destination: "/blog/:section",
		permanent: true,
	},

	// `/:section/feed` → that section's Atom feed.
	{
		source: `/:section(${SECTION_PATTERN})/feed`,
		destination: "/api/feed/:section",
		permanent: true,
	},
	// Sectionless `/feed` → the default section's feed.
	{
		source: "/feed",
		destination: `/api/feed/${DEFAULT_FEED_SECTION}`,
		permanent: true,
	},
	// Conventional feed URLs readers and people guess when there's no
	// autodiscovery link at hand. All are site-root guesses with no section, so
	// they map to the default section's feed — the same target as `/feed` above,
	// keeping every feed alias uniform. The alternation is a full path segment,
	// so a real slug that merely ends in one of these words doesn't match.
	{
		source: "/:alias(rss|rss\\.xml|feed\\.xml|atom\\.xml|index\\.xml)",
		destination: `/api/feed/${DEFAULT_FEED_SECTION}`,
		permanent: true,
	},
]

/**
 * Content-shaped URLs that are served by a route handler living elsewhere in the
 * tree. Rewrites, not redirects, so the pretty URL stays in the address bar and
 * stored subscriptions never 301-hop.
 *
 * These belong in `beforeFiles` — an `afterFiles` rewrite runs only once the
 * filesystem has failed to match, and `/blog/:section/:slug.md` would first be
 * captured by the `/blog/[section]/[slug]` page with a literal `foo.md` slug.
 */
export const LEGACY_REWRITES: Rewrite[] = [
	// `/blog/:section/feed.xml` → the Atom feed handler. This is the URL
	// advertised for autodiscovery and set as the feed's `rel="self"`, so the
	// canonical feed is decoupled from the internal `/api/` route shape and
	// doesn't lean on the `robots.ts` `Allow: /api/feed/` exception to stay
	// crawlable. The handler can't live at this path because a `route.ts` can't
	// coexist with the `/blog/:section/[slug]` page tree.
	//
	// Listed ahead of the `.md` rule for readability only; `feed.xml` has no
	// `.md` suffix, so the two can't collide.
	{
		source: `/blog/:section(${SECTION_PATTERN})/feed.xml`,
		destination: "/api/feed/:section",
	},
	// `/blog/:section/:slug.md` serves a post's raw markdown (frontmatter +
	// body) from `/api/blog/:section/:slug/md`, which can't live at the post's
	// own path because a `route.ts` and a `page.tsx` can't coexist there.
	//
	// The slug pattern mirrors `createSlug`'s output (`[a-z0-9-]` only), which
	// is what makes the single `.md` suffix unambiguous — a slug can't itself
	// contain a dot.
	{
		source: `/blog/:section(${SECTION_PATTERN})/:slug([a-z0-9-]+).md`,
		destination: "/api/blog/:section/:slug/md",
	},
]
