import { NextResponse } from "next/server"
import { getSessionSecret, verifyToken } from "@/lib/auth"
import { SECTIONS } from "@/lib/sections"
import type { NextRequest } from "next/server"

const SESSION_COOKIE = "session"

// Known top-level routes that are not legacy slugs. Must be kept in sync with
// the top-level folders under `src/app/` — a real route missing from this set
// gets rewritten to the legacy-redirect lookup, then 404s.
const KNOWN_ROUTES = new Set([
	"/about",
	"/admin",
	"/api",
	"/blog",
	"/privacy",
	"/projects",
	"/tools",
])

const SECTION_ALTERNATION = SECTIONS.join("|")

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
	const { pathname } = request.nextUrl

	// Skip middleware work for paths that can never be legacy slugs or admin pages.
	// `.` catches static assets; the matcher already filters most, but keeps this safe.
	if (pathname.startsWith("/_next/") || pathname.includes(".")) {
		return NextResponse.next()
	}

	const isAdminApi =
		pathname.startsWith("/api/admin/") || pathname === "/api/upload"
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

	// /tech/blog/:slug → /blog/tech/:slug, /life/blog/:slug → /blog/life/:slug
	const sectionBlogMatch = pathname.match(SECTION_BLOG_REGEX)

	if (sectionBlogMatch) {
		return NextResponse.redirect(
			new URL(
				`/blog/${sectionBlogMatch[1]}/${sectionBlogMatch[2]}`,
				request.url
			),
			301
		)
	}

	const archiveMatch = pathname.match(SECTION_ARCHIVE_REGEX)

	if (archiveMatch) {
		return NextResponse.redirect(
			new URL(`/blog/${archiveMatch[1]}/archive`, request.url),
			301
		)
	}

	const searchMatch = pathname.match(SECTION_SEARCH_REGEX)

	if (searchMatch) {
		return NextResponse.redirect(
			new URL(`/blog/${searchMatch[1]}/search`, request.url),
			301
		)
	}

	const sectionRootMatch = pathname.match(SECTION_ROOT_REGEX)

	if (sectionRootMatch) {
		return NextResponse.redirect(
			new URL(`/blog/${sectionRootMatch[1]}`, request.url),
			301
		)
	}

	// `(/tech|/life)?/feed` → `/api/feed/(tech|life)`, defaulting to first section.
	const feedMatch = pathname.match(FEED_REGEX)

	if (feedMatch) {
		const section = feedMatch[1] ?? SECTIONS[0]

		return NextResponse.redirect(
			new URL(`/api/feed/${section}`, request.url),
			301
		)
	}

	// Single-segment paths not matching known routes are potential old post slugs.
	// DB lookup is handled in /app/[slug]/route.ts to keep middleware edge-safe.
	const segments = pathname.split("/").filter(Boolean)
	const isRootSlug =
		segments.length === 1 && !KNOWN_ROUTES.has(`/${segments[0]}`)

	if (isRootSlug) {
		const lookupUrl = request.nextUrl.clone()
		lookupUrl.pathname = `/api/legacy-redirect/${segments[0]}`

		return NextResponse.rewrite(lookupUrl)
	}

	return NextResponse.next()
}

export const config = {
	matcher: [
		// Run on all paths except static files and Next.js internals.
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)).*)",
	],
}
