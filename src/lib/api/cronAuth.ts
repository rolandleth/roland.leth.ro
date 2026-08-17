import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { getCronSecret } from "@/lib/auth/env"
import type { NextRequest } from "next/server"

/**
 * Constant-time `Bearer <secret>` comparison against the configured cron secret.
 *
 * `timingSafeEqual` requires equal-length buffers; the length check leaks the
 * expected length but that's unavoidable and acceptable for a server-configured
 * secret. Always run the compare against a same-length dummy when lengths
 * differ so the byte-level work is constant-time either way.
 */
function isAuthorized(auth: string | null, expected: string): boolean {
	const expectedBuf = Buffer.from(`Bearer ${expected}`)
	const authBuf = Buffer.from(auth ?? "")

	if (authBuf.length !== expectedBuf.length) {
		timingSafeEqual(expectedBuf, expectedBuf)

		return false
	}

	return timingSafeEqual(authBuf, expectedBuf)
}

/**
 * Gates a cron route. Returns a 401 `NextResponse` to return as-is, or `null`
 * when the caller is authorized.
 *
 * `tag` names the calling route in log lines so two cron routes sharing this
 * helper stay distinguishable. Pass it PRE-BRACKETED (`[api:cron:ping]`), the
 * same convention `logMiddlewareBypass` and `requireAdmin` take — this helper
 * used to bracket the tag itself, so the two conventions sat side by side and
 * `requireCronAuth("[api:cron:x]")` rendered `[[api:cron:x]]`. Log shape is what
 * alert rules grep on, so it is single-sourced deliberately.
 *
 * Both failure modes log, because a silent 401 here means a cron silently
 * stopped running — see the scheduled-post route, where that would strand a post
 * indefinitely.
 */
export function requireCronAuth(
	request: NextRequest,
	tag: string
): NextResponse | null {
	const expected = getCronSecret()

	if (expected === null) {
		// Server config error: cron can't function. Log at error level so a
		// Vercel-side env regression is visible, but surface as 401 (not 500
		// naming the env var) to the unauthenticated caller — otherwise a
		// pre-auth probe learns the server is missing CRON_SECRET.
		// eslint-disable-next-line no-console
		console.error(`${tag} CRON_SECRET not configured`)

		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	if (!isAuthorized(request.headers.get("authorization"), expected)) {
		// Routine adversarial signal (port scanners, stale cron config); warn
		// rather than error so a scan doesn't dominate the error log.
		//
		// The payload is what separates the two. A port scan has no authorization
		// header at all; a cron firing with a stale secret has one that is simply
		// wrong. Logging neither the path nor whether a header was even present
		// made a silently-broken cron indistinguishable from background noise —
		// the exact outcome this branch is logged to prevent. The header VALUE is
		// deliberately not logged: it is a near-miss of the real secret.
		// eslint-disable-next-line no-console
		console.warn(`${tag} unauthorized`, {
			path: new URL(request.url).pathname,
			method: request.method,
			hasAuthorizationHeader: request.headers.get("authorization") !== null,
		})

		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	return null
}
