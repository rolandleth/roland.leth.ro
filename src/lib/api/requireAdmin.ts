import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth/auth"

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
 * It logs at error level precisely because it should be unreachable — a line
 * here means a request got past the matcher, which is a security event, not a
 * routine 401 (those come from the middleware and never reach this code).
 *
 * @param tag Route-identifying log tag, e.g. `[api:admin:posts:POST]`.
 */
export async function requireAdmin(tag: string): Promise<NextResponse | null> {
	if (await verifySession()) {
		return null
	}

	// eslint-disable-next-line no-console
	console.error(
		`${tag} unauthenticated request reached the handler — the middleware gate did not run for this path`
	)

	return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
