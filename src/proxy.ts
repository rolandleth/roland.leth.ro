import { NextResponse } from "next/server"
import { getSessionSecret, verifyToken } from "@/lib/auth"
import { type Section, SECTIONS } from "@/lib/sections"
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

async function isAuthenticated(request: NextRequest): Promise<boolean> {
	const token = request.cookies.get(SESSION_COOKIE)?.value

	if (!token) {
		return false
	}

	const payload = await verifyToken(token, getSessionSecret())

	return payload !== null
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

	// Match the `/api/admin` namespace explicitly: `startsWith("/api/admin/")`
	// alone would let `/api/admin` (no trailing slash) bypass the auth gate
	// and fall through to the generic `/api/*` pass-through. No route currently
	// lives at the bare path, but the guard is cheap defense in depth.
	const isAdminApi =
		pathname === "/api/admin" || pathname.startsWith("/api/admin/")
	const isAdminPage =
		pathname.startsWith("/admin") && pathname !== "/admin/login"

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

	// Analytics and share query strings (`?ref=`, `?utm_*`) must survive the
	// legacy redirect; `new URL(path, base)` would otherwise strip `base`'s
	// query since `path` overrides it. Append `search` to every redirect target.

	if (pathname === "/privacy-policy") {
		return NextResponse.redirect(new URL(`/privacy${search}`, request.url), 301)
	}

	// /tech/blog/:slug → /blog/tech/:slug, /life/blog/:slug → /blog/life/:slug
	const sectionBlogMatch = pathname.match(SECTION_BLOG_REGEX)

	if (sectionBlogMatch) {
		return NextResponse.redirect(
			new URL(
				`/blog/${sectionBlogMatch[1]}/${sectionBlogMatch[2]}${search}`,
				request.url
			),
			301
		)
	}

	const archiveMatch = pathname.match(SECTION_ARCHIVE_REGEX)

	if (archiveMatch) {
		return NextResponse.redirect(
			new URL(`/blog/${archiveMatch[1]}/archive${search}`, request.url),
			301
		)
	}

	const searchMatch = pathname.match(SECTION_SEARCH_REGEX)

	if (searchMatch) {
		return NextResponse.redirect(
			new URL(`/blog/${searchMatch[1]}/search${search}`, request.url),
			301
		)
	}

	const sectionRootMatch = pathname.match(SECTION_ROOT_REGEX)

	if (sectionRootMatch) {
		return NextResponse.redirect(
			new URL(`/blog/${sectionRootMatch[1]}${search}`, request.url),
			301
		)
	}

	// `(/tech|/life)?/feed` → `/api/feed/(tech|life)`, defaulting to first section.
	const feedMatch = pathname.match(FEED_REGEX)

	if (feedMatch) {
		const section = feedMatch[1] ?? DEFAULT_FEED_SECTION

		return NextResponse.redirect(
			new URL(`/api/feed/${section}${search}`, request.url),
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
