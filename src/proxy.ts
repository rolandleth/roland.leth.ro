import { NextResponse } from "next/server"
import { getSessionSecretKey, verifyToken } from "@/lib/auth/auth"
import type { NextRequest } from "next/server"

const SESSION_COOKIE = "session"

async function isAuthenticated(request: NextRequest): Promise<boolean> {
	const token = request.cookies.get(SESSION_COOKIE)?.value

	if (!token) {
		return false
	}

	const payload = await verifyToken(token, getSessionSecretKey())

	return payload !== null
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
	const { pathname } = request.nextUrl

	// Lower-cased so a case variant (`/ADMIN/…`) can't slip past the gate. Next.js
	// routing is case-sensitive, so an uppercase variant 404s rather than reaching
	// a real admin route — but matching case-insensitively here can only ever ADD
	// protection, never remove it.
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

	// An authenticated admin request, or `/admin/login`. Everything else the
	// matcher admits has already returned above.
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
//   (logged as a security event) instead of running unauthenticated. Enforced
//   by `src/app/api/admin/adminAuthContract.test.ts`.
// - `/admin/*`: pages have no `requireAdmin`. Three layers, none of which
//   alone covers a page's whole surface:
//     - `(protected)/layout.tsx` covers the rendered body — but does NOT
//       re-run on a client-side navigation within the same route segment.
//     - `requireAdminPageSession` is the layout's client-nav gap closed per
//       page: every page whose body reads data (all four `[id]/edit` pages,
//       the two `new` pages that read a list, and the dashboard root) calls
//       it directly.
//     - `adminEditMetadata` covers only the edit pages' `generateMetadata`
//       (which runs outside the layout) — and only the `<title>`: it logs and
//       falls back, it does not stop the page body from rendering, since Next
//       calls the two independently. It is NOT a substitute for
//       `requireAdminPageSession` on the same page.
//   Enforced by `src/app/admin/adminPageContract.test.ts`, which walks the
//   page tree: a page outside `(protected)/`, a page that reads data in its
//   body without calling `requireAdminPageSession`, or an edit page that skips
//   the metadata guard, fails there rather than relying on the next author
//   reading this.
//
// A bypass at any of these guards is reported through `logMiddlewareBypass`,
// which owns the shared message text and stamps a per-request `bypassId` — a
// bypassed edit page trips both its own guard and the layout's, and that
// field is what joins the lines into one event.
export const config = {
	matcher: ["/admin", "/admin/:path*", "/api/admin", "/api/admin/:path*"],
}
