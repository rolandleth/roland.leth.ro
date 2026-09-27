import { NextResponse } from "next/server"
import { refuseCrossSiteWrite } from "@/lib/api/sameOrigin"
import { verifySession } from "@/lib/auth/auth"
import { logMiddlewareBypass } from "@/lib/auth/middlewareBypass"

/**
 * Guards an admin API handler. Returns a 401 response when the request carries
 * no valid admin session, or `null` when the caller may proceed — the same
 * `NextResponse | value` shape as `parseIdParam`, so handlers keep one early-
 * return idiom.
 *
 * `src/proxy.ts` already gates `/api/admin/*`, so in normal operation this
 * never fires. That is the point: the middleware was the *only* thing standing
 * between the public internet and these handlers, which made any gap in its
 * path matching a silent, complete auth bypass. This is the second lock.
 *
 * The bypass is reported through `logMiddlewareBypass`, which owns the message
 * text shared with the two page-side guards — see that module for why a line
 * here is an error and not a routine 401.
 *
 * A valid session is not enough for a write: `refuseCrossSiteWrite` then
 * refuses one a browser sent from another site (403), since the browser
 * attaches the cookie either way. It lives here rather than in the middleware
 * so every handler gets it through the call it already has to make, and
 * `adminAuthContract.test.ts` holds every write handler to it.
 *
 * @param request The incoming request; its method and origin headers decide
 * the cross-site check.
 * @param tag Route-identifying log tag, e.g. `[api:admin:posts:POST]`.
 */
export async function requireAdmin(
	request: Request,
	tag: string
): Promise<NextResponse | null> {
	if (!(await verifySession())) {
		logMiddlewareBypass(tag, "the handler")

		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	return refuseCrossSiteWrite(request, tag)
}
