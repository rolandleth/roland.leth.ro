import { NextResponse } from "next/server"
import { getSessionSecret, verifyToken } from "@/lib/auth/auth"
import { type Section, SECTIONS } from "@/lib/db/sections"
import { isBotProbe } from "@/lib/proxy/botProbes"
import type { NextRequest } from "next/server"

const SESSION_COOKIE = "session"

const SECTION_ALTERNATION = SECTIONS.join("|")

// Pinned explicitly so that reordering `SECTIONS` (e.g. adding a new section
// at position 0) doesn't silently redirect `/feed` to a different Atom feed
// for every existing subscriber.
const DEFAULT_FEED_SECTION: Section = "tech"

// Hoisted so Node doesn't re-compile these on every middleware invocation.
const SECTION_BLOG_REGEX = new RegExp(`^/(${SECTION_ALTERNATION})/blog/(.+)$`)
const SECTION_ARCHIVE_REGEX = new RegExp(`^/(${SECTION_ALTERNATION})/archive$`)
const SECTION_SEARCH_REGEX = new RegExp(`^/(${SECTION_ALTERNATION})/search$`)
const SECTION_ROOT_REGEX = new RegExp(`^/(${SECTION_ALTERNATION})$`)
const FEED_REGEX = new RegExp(`^(?:/(${SECTION_ALTERNATION}))?/feed$`)
// Conventional feed URLs readers and people guess when there's no autodiscovery
// link at hand. All are site-root guesses with no section, so they map to the
// default section's feed — same target as `/feed` above, keeping every feed
// alias uniform. `.xml` is deliberately absent from the bot-probe extension set,
// so these reach the redirect instead of being 404'd as scanner noise.
const FEED_ALIAS_REGEX = /^\/(?:rss|rss\.xml|feed\.xml|atom\.xml|index\.xml)$/
// `/blog/:section/:slug.md` → the raw-markdown route handler. Slugs are
// `[a-z0-9-]` only (see `createSlug`), so they never contain a dot — the single
// `\.md$` anchor unambiguously splits slug from extension.
const BLOG_MD_REGEX = new RegExp(
	`^/blog/(${SECTION_ALTERNATION})/([^/]+?)\\.md$`
)
// `/blog/:section/feed.xml` → the Atom feed handler. This content-shaped URL is
// the one advertised for autodiscovery and set as the feed's `rel="self"`, so
// the canonical feed is decoupled from the internal `/api/` route shape and
// doesn't lean on the `robots.ts` `Allow: /api/feed/` exception to stay
// crawlable. Rewritten, not redirected, so the pretty URL stays in the address
// bar and stored subscriptions never 301-hop.
const BLOG_FEED_REGEX = new RegExp(
	`^/blog/(${SECTION_ALTERNATION})/feed\\.xml$`
)

async function isAuthenticated(request: NextRequest): Promise<boolean> {
	const token = request.cookies.get(SESSION_COOKIE)?.value

	if (!token) {
		return false
	}

	const payload = await verifyToken(token, getSessionSecret())

	return payload !== null
}

/**
 * Maps a legacy URL to its canonical redirect *path* (query string excluded), or
 * `null` when no legacy pattern applies. Extracted from `proxy` so the middleware's
 * top-level branching stays within the cognitive-complexity budget; each pattern
 * is an independent single-responsibility match. The caller appends `search` and
 * issues the 301 — analytics/share query strings (`?ref=`, `?utm_*`) must survive.
 */
function matchLegacyRedirect(pathname: string): string | null {
	if (pathname === "/privacy-policy") {
		return "/privacy"
	}

	// /tech/blog/:slug → /blog/tech/:slug, /life/blog/:slug → /blog/life/:slug
	const sectionBlogMatch = pathname.match(SECTION_BLOG_REGEX)

	if (sectionBlogMatch) {
		return `/blog/${sectionBlogMatch[1]}/${sectionBlogMatch[2]}`
	}

	const archiveMatch = pathname.match(SECTION_ARCHIVE_REGEX)

	if (archiveMatch) {
		return `/blog/${archiveMatch[1]}/archive`
	}

	const searchMatch = pathname.match(SECTION_SEARCH_REGEX)

	if (searchMatch) {
		return `/blog/${searchMatch[1]}/search`
	}

	const sectionRootMatch = pathname.match(SECTION_ROOT_REGEX)

	if (sectionRootMatch) {
		return `/blog/${sectionRootMatch[1]}`
	}

	// `(/tech|/life)?/feed` → `/api/feed/(tech|life)`, defaulting to first section.
	const feedMatch = pathname.match(FEED_REGEX)

	if (feedMatch) {
		return `/api/feed/${feedMatch[1] ?? DEFAULT_FEED_SECTION}`
	}

	// Conventional feed-URL guesses (`/rss`, `/feed.xml`, …) → the default feed.
	if (FEED_ALIAS_REGEX.test(pathname)) {
		return `/api/feed/${DEFAULT_FEED_SECTION}`
	}

	return null
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
	const { pathname, search } = request.nextUrl

	// Defensive short-circuit for internal Next.js paths; the `config.matcher`
	// already excludes `_next/static` and `_next/image`, but this catches any
	// future `_next/*` without relying on the negative-lookahead pattern. Dots
	// in the pathname used to short-circuit here too, but that also dropped
	// legacy slugs containing dots (e.g. `v1.2.3`, `node.js`) out of the
	// redirect path — static assets are already excluded via the matcher.
	if (pathname.startsWith("/_next/")) {
		return NextResponse.next()
	}

	// Kill obvious scanner/bot probes with a bare 404 before they reach a function.
	// They never match a real route, so they'd otherwise fall through to the
	// `[slug]` catch-all and pay for a full not-found render. Placed ahead of the
	// admin gate so junk like `/administrator` 404s instead of triggering an
	// `isAuthenticated` check and a redirect to `/admin/login`.
	if (isBotProbe(pathname)) {
		return new NextResponse(null, { status: 404 })
	}

	// Lower-cased so a case variant (`/ADMIN/…`) can't slip past the gate. Next.js
	// routing is case-sensitive, so an uppercase variant 404s rather than reaching
	// a real admin route — but matching case-insensitively here can only ever ADD
	// protection, never remove it, and closes the asymmetry with the (already
	// lower-cased) bot-probe filter above.
	//
	// Token-minting endpoints deliberately live OUTSIDE this namespace, under
	// `/api/auth/*` (e.g. `/api/auth/login`), so they aren't gated behind the JWT
	// they exist to issue. Don't add a login handler under `/api/admin/*`.
	const gatedPath = pathname.toLowerCase()

	// Match the `/api/admin` namespace explicitly: `startsWith("/api/admin/")`
	// alone would let `/api/admin` (no trailing slash) bypass the auth gate
	// and fall through to the generic `/api/*` pass-through. No route currently
	// lives at the bare path, but the guard is cheap defense in depth.
	const isAdminApi =
		gatedPath === "/api/admin" || gatedPath.startsWith("/api/admin/")
	const isAdminPage =
		(gatedPath === "/admin" || gatedPath.startsWith("/admin/")) &&
		gatedPath !== "/admin/login"

	if (isAdminApi || isAdminPage) {
		const isAuthed = await isAuthenticated(request)

		if (!isAuthed) {
			if (isAdminApi) {
				return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
			}

			const loginUrl = request.nextUrl.clone()
			loginUrl.pathname = "/admin/login"

			return NextResponse.redirect(loginUrl)
		}
	}

	// Other /api/* routes don't need legacy redirect handling.
	if (pathname.startsWith("/api/")) {
		return NextResponse.next()
	}

	// `/blog/:section/:slug.md` serves the raw markdown of a post (frontmatter +
	// body). It's an internal REWRITE — the URL stays `.md` — to the route handler
	// at `/api/blog/:section/:slug/md`, which can't live at the post's own path
	// because a `route.ts` and a `page.tsx` can't coexist there. Rewrites don't
	// re-run middleware, so the target skips the auth gate above harmlessly.
	const blogMarkdownMatch = pathname.match(BLOG_MD_REGEX)

	if (blogMarkdownMatch) {
		return NextResponse.rewrite(
			new URL(
				`/api/blog/${blogMarkdownMatch[1]}/${blogMarkdownMatch[2]}/md`,
				request.url
			)
		)
	}

	// `/blog/:section/feed.xml` → the feed route handler at `/api/feed/:section`.
	// A rewrite (not a redirect) keeps the pretty URL canonical; the handler
	// can't live at this path because a `route.ts` can't coexist with the
	// `/blog/:section/[slug]` page tree.
	const blogFeedMatch = pathname.match(BLOG_FEED_REGEX)

	if (blogFeedMatch) {
		return NextResponse.rewrite(
			new URL(`/api/feed/${blogFeedMatch[1]}`, request.url)
		)
	}

	// Legacy URL → canonical path. `search` is appended here (not in the helper)
	// so analytics/share query strings survive the 301.
	const legacyTarget = matchLegacyRedirect(pathname)

	if (legacyTarget) {
		return NextResponse.redirect(
			new URL(`${legacyTarget}${search}`, request.url),
			301
		)
	}

	// Unmatched single-segment paths (potential legacy post/project slugs) fall
	// through to Next.js routing, where `src/app/[slug]/page.tsx` takes over
	// only when no static top-level route matches — so no KNOWN_ROUTES list to
	// maintain. The catch-all page does the DB lookup + `permanentRedirect` or
	// `notFound()`.
	return NextResponse.next()
}

export const config = {
	matcher: [
		// Run on all paths except static files and Next.js internals. The
		// extension group is anchored with `$` so it excludes only real asset
		// URLs. Unanchored, the alternative matched an extension ANYWHERE in the
		// path, so `/api/admin/posts/1.json` (`.json` contains `.js`) skipped the
		// middleware — and with it the admin auth gate — entirely.
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
		// The gated namespaces are also matched explicitly, so no future edit to
		// the exclusion pattern above can silently drop them. What sits behind
		// this middleware differs by namespace, so don't trim either entry:
		//
		// - `/api/admin/*`: every route handler re-checks the session via
		//   `requireAdmin`, so a path that misses the matcher 401s at the handler
		//   (logged as a security event) instead of running unauthenticated.
		// - `/admin/*`: pages have no `requireAdmin`. `(protected)/layout.tsx`
		//   covers the rendered body, and `adminEditMetadata` covers the edit
		//   pages' `generateMetadata` (which runs outside the layout) — but any
		//   new page that reads data outside both is gated by this matcher alone.
		"/admin",
		"/admin/:path*",
		"/api/admin",
		"/api/admin/:path*",
	],
}
