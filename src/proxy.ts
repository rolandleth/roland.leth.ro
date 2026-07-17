import { NextResponse } from "next/server"
import { getSessionSecret, verifyToken } from "@/lib/auth/auth"
import { type Section, SECTIONS } from "@/lib/db/sections"
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
// `/blog/:section/:slug.md` → the raw-markdown route handler. Slugs are
// `[a-z0-9-]` only (see `createSlug`), so they never contain a dot — the single
// `\.md$` anchor unambiguously splits slug from extension.
const BLOG_MD_REGEX = new RegExp(
	`^/blog/(${SECTION_ALTERNATION})/([^/]+?)\\.md$`
)

// Scanner/bot probes that can never be a real route or legacy slug here. Middleware
// already runs on every request, so short-circuiting them to a bare 404 stops the
// probe before it reaches the `[slug]` catch-all's not-found render — a billed
// function invocation. The patterns are kept SPECIFIC on purpose: a blanket
// "has a dot" / "starts with a dot" rule would eat legitimate dotted legacy slugs
// (`/v1.2.3`, `/node.js`) and `/.well-known/*` (ACME, security.txt,
// apple-app-site-association). That's the same trap the `/_next/` short-circuit
// below documents having already fallen into once.

// Server-script, config, secret, dump, and archive extensions. Deliberately NOT
// `md` (blog markdown export), `txt`/`xml` (llms.txt, sitemap, robots), or the
// image/css/js the `config.matcher` already excludes. This site was never PHP/ASP/
// Java, so none of these can collide with a real legacy slug. A Set (vs. one big
// alternation regex) keeps the check O(1) and trivially extendable from logs.
const BOT_PROBE_EXTENSIONS = new Set([
	"php",
	"php5",
	"php7",
	"phtml",
	"phar",
	"asp",
	"aspx",
	"jsp",
	"jspx",
	"cgi",
	"cfm",
	"do",
	"action",
	"env",
	"ini",
	"conf",
	"cfg",
	"toml",
	"yml",
	"yaml",
	"sql",
	"bak",
	"old",
	"swp",
	"sh",
	"pl",
	"py",
	"rb",
	"war",
	"jar",
	"dll",
	"tar",
	"gz",
	"tgz",
	"rar",
	"7z",
	"zip",
])

// Known scanner path segments (WordPress, PHP admin panels, VCS/secret dirs, Java
// actuators). `/.well-known` is deliberately absent — it's a real, load-bearing
// path. Matched with segment boundaries (see `isBotProbe`) so `/administrator`
// 404s but a hypothetical `/administrator-guide` post slug still passes through.
const BOT_PROBE_PATH_PREFIXES = [
	"/wp-admin",
	"/wp-login",
	"/wp-content",
	"/wp-includes",
	"/wp-json",
	"/wordpress",
	"/xmlrpc",
	"/phpmyadmin",
	"/phpinfo",
	"/administrator",
	"/vendor",
	"/cgi-bin",
	"/actuator",
	"/.git",
	"/.env",
	"/.aws",
	"/.ssh",
	"/.svn",
	"/.hg",
	"/.vscode",
	"/.idea",
	"/.ds_store",
]

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

	return null
}

/**
 * True when `pathname` is an obvious scanner/bot probe — a script/config/archive
 * extension or a known-bad path segment (WordPress, PHP admin panels, exposed
 * VCS/secret dirs). Path prefixes match only at a segment boundary (`===`, `/`, or
 * `.`) so `/administrator` and `/.env.local` match while `/administrator-guide`
 * does not. See `BOT_PROBE_EXTENSIONS` / `BOT_PROBE_PATH_PREFIXES` for why the
 * match is kept narrow rather than a blanket dotfile/extension rule.
 */
function isBotProbe(pathname: string): boolean {
	const lowerPath = pathname.toLowerCase()
	const lastSegment = lowerPath.slice(lowerPath.lastIndexOf("/") + 1)
	const dotIndex = lastSegment.lastIndexOf(".")

	// `dotIndex > 0` skips leading-dot dotfiles (`.env`): those resolve via the
	// path-prefix list, not by extension.
	if (
		dotIndex > 0 &&
		BOT_PROBE_EXTENSIONS.has(lastSegment.slice(dotIndex + 1))
	) {
		return true
	}

	return BOT_PROBE_PATH_PREFIXES.some(
		(prefix) =>
			lowerPath === prefix ||
			lowerPath.startsWith(`${prefix}/`) ||
			lowerPath.startsWith(`${prefix}.`)
	)
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

	// Match the `/api/admin` namespace explicitly: `startsWith("/api/admin/")`
	// alone would let `/api/admin` (no trailing slash) bypass the auth gate
	// and fall through to the generic `/api/*` pass-through. No route currently
	// lives at the bare path, but the guard is cheap defense in depth.
	const isAdminApi =
		pathname === "/api/admin" || pathname.startsWith("/api/admin/")
	const isAdminPage =
		(pathname === "/admin" || pathname.startsWith("/admin/")) &&
		pathname !== "/admin/login"

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
		// Run on all paths except static files and Next.js internals.
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)).*)",
	],
}
