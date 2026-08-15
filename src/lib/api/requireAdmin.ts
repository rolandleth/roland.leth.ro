import { NextResponse } from "next/server"
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
 * @param tag Route-identifying log tag, e.g. `[api:admin:posts:POST]`.
 */
export async function requireAdmin(tag: string): Promise<NextResponse | null> {
	if (await verifySession()) {
		return null
	}

	logMiddlewareBypass(tag, "the handler")

	return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
