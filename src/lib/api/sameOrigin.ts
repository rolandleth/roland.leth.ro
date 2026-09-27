import { NextResponse } from "next/server"

/** Methods a browser may send cross-site without it being a write. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * Refuses a cookie-authenticated write that a browser sent from another site,
 * or `null` when the request may proceed.
 *
 * The session cookie is `SameSite=Lax`, which stops a cross-site POST from
 * carrying it, but not one from a sibling subdomain: every `*.leth.ro` page is
 * "same-site" to the browser. So a write also has to prove it came from this
 * origin:
 *
 * - `Sec-Fetch-Site`, when sent, must be `same-origin`. `same-site` is exactly
 *   the subdomain case, so it's refused too.
 * - `Origin`, when sent, must match the request's own origin. This covers
 *   browsers without `Sec-Fetch-*`.
 *
 * A request with neither header passes. Browsers send `Origin` on every
 * cross-origin POST, PUT and DELETE, so a request without one didn't come from
 * another site's page; it came from a script or `curl`, which needs the cookie
 * value already and gains nothing from this check.
 *
 * @param tag Route-identifying log tag, e.g. `[api:admin:posts:POST]`.
 */
export function refuseCrossSiteWrite(
	request: Request,
	tag: string
): NextResponse | null {
	if (SAFE_METHODS.has(request.method)) {
		return null
	}

	const fetchSite = request.headers.get("sec-fetch-site")
	const origin = request.headers.get("origin")
	const isFetchSiteForeign = fetchSite != null && fetchSite !== "same-origin"
	const isOriginForeign =
		origin != null && origin !== new URL(request.url).origin

	if (!isFetchSiteForeign && !isOriginForeign) {
		return null
	}

	// Warn, not error: a stray cross-site form or a browser extension is noise,
	// not a breach, since the write never ran. Both headers are logged so a
	// false positive (a proxy rewriting the host) is diagnosable from one line.
	// eslint-disable-next-line no-console
	console.warn(`${tag} cross-site write refused`, {
		secFetchSite: fetchSite,
		origin,
	})

	return NextResponse.json(
		{ error: "Cross-site request refused" },
		{ status: 403 }
	)
}
