import { NextResponse } from "next/server"
import { getSessionSecret, verifyToken } from "@/lib/auth/auth"
import { isBotProbe } from "@/lib/proxy/botProbes"
import type { NextRequest } from "next/server"

const SESSION_COOKIE = "session"

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

	// Kill obvious scanner/bot probes with a bare 404 before the auth gate runs,
	// so an admin-shaped probe (`/admin/config.php`) 404s instead of paying for
	// an `isAuthenticated` check and a redirect to `/admin/login`.
	//
	// This filter used to carry far more weight: it also kept junk off the
	// `/:slug` catch-all, which invoked a function and rendered a full 404 page.
	// That route is gone, so every non-admin probe now resolves to the static
	// 404 without reaching compute at all, and the matcher below no longer needs
	// to see them.
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

	// Everything else falls through to Next.js routing. Legacy redirects and the
	// two content-shaped rewrites (`:slug.md`, `feed.xml`) used to be handled
	// here; they now live in `next.config.ts` via `src/lib/routing/legacyRoutes.ts`,
	// where Vercel's routing layer resolves them without a function invocation.
	// The redirects run ahead of this middleware, the rewrites just after it.
	return NextResponse.next()
}

// ONLY the two gated namespaces. Everything this middleware used to do for
// public traffic — legacy redirects, the `:slug.md` and `feed.xml` rewrites —
// now resolves in Vercel's routing layer via `next.config.ts`, and every
// unmatched path resolves to the static 404. So a public page view, an RSC
// prefetch, a feed hit, and a scanner probe all cost zero compute here.
//
// The previous catch-all matcher (everything minus an asset-extension group)
// is deliberately NOT kept as a backstop: a broad pattern is what produced the
// 2026-07-26 bypass, where an unanchored extension group let any path merely
// CONTAINING `.js` (such as `/api/admin/posts/1.json`) skip the auth gate. An
// explicit namespace list has no such failure mode.
//
// What sits behind this middleware differs by namespace, so don't trim either
// pair of entries:
//
// - `/api/admin/*`: every route handler re-checks the session via
//   `requireAdmin`, so a path that misses the matcher 401s at the handler
//   (logged as a security event) instead of running unauthenticated.
// - `/admin/*`: pages have no `requireAdmin`. `(protected)/layout.tsx` covers
//   the rendered body, and `adminEditMetadata` covers the edit pages'
//   `generateMetadata` (which runs outside the layout) — but any new page that
//   reads data outside both is gated by this matcher alone.
export const config = {
	matcher: ["/admin", "/admin/:path*", "/api/admin", "/api/admin/:path*"],
}
