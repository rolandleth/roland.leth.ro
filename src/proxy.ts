import { jwtVerify } from "jose"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const SESSION_COOKIE = "session"

// Known top-level routes that are not legacy slugs.
const KNOWN_ROUTES = new Set(["/about", "/projects", "/blog", "/admin", "/api"])

function getSecret(): Uint8Array {
	const secret = process.env.SESSION_SECRET

	if (!secret) {
		throw new Error("Cannot authenticate")
	}

	return new TextEncoder().encode(secret)
}

async function isAuthenticated(request: NextRequest): Promise<boolean> {
	const token = request.cookies.get(SESSION_COOKIE)?.value
	if (!token) {
		return false
	}

	try {
		await jwtVerify(token, getSecret())
		return true
	} catch {
		return false
	}
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
	const { pathname } = request.nextUrl

	// --- Auth: protect /admin and admin API routes ---
	const isAdminApi =
		pathname.startsWith("/api/admin/") || pathname === "/api/upload"
	const isAdminPage =
		pathname.startsWith("/admin") && pathname !== "/admin/login"

	if (isAdminApi || isAdminPage) {
		if (!(await isAuthenticated(request))) {
			if (isAdminApi) {
				return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
			}

			const loginUrl = request.nextUrl.clone()
			loginUrl.pathname = "/admin/login"

			return NextResponse.redirect(loginUrl)
		}
	}

	// --- Legacy redirects: pattern-based (no DB query) ---

	// /tech/blog/:slug → /blog/tech/:slug
	// /life/blog/:slug → /blog/life/:slug
	const sectionBlogMatch = pathname.match(/^\/(tech|life)\/blog\/(.+)$/)
	if (sectionBlogMatch) {
		return NextResponse.redirect(
			new URL(
				`/blog/${sectionBlogMatch[1]}/${sectionBlogMatch[2]}`,
				request.url
			),
			301
		)
	}

	// /tech/archive → /blog/tech/archive
	// /life/archive → /blog/life/archive
	const archiveMatch = pathname.match(/^\/(tech|life)\/archive$/)
	if (archiveMatch) {
		return NextResponse.redirect(
			new URL(`/blog/${archiveMatch[1]}/archive`, request.url),
			301
		)
	}

	// /tech/search → /blog/tech/search
	const searchMatch = pathname.match(/^\/(tech|life)\/search$/)
	if (searchMatch) {
		return NextResponse.redirect(
			new URL(`/blog/${searchMatch[1]}/search`, request.url),
			301
		)
	}

	// /tech → /blog/tech
	// /life → /blog/life
	if (pathname === "/tech" || pathname === "/life") {
		const section = pathname.slice(1)
		return NextResponse.redirect(new URL(`/blog/${section}`, request.url), 301)
	}

	// (/tech|/life)?/feed → /api/feed/(tech|life), defaulting to tech
	const feedMatch = pathname.match(/^(?:\/(tech|life))?\/feed$/)
	if (feedMatch) {
		const section = feedMatch[1] ?? "tech"
		return NextResponse.redirect(
			new URL(`/api/feed/${section}`, request.url),
			301
		)
	}

	// --- Legacy redirects: root-level slugs (/:slug) ---
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
