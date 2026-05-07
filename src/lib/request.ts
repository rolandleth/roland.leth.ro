import { headers } from "next/headers"

export function defaultProto(host: string): "http" | "https" {
	// `host.includes(":")` used to stand in for "has a port = dev", but an https
	// host with an explicit port (e.g. `example.com:8443`) also has a colon and
	// would wrongly resolve to http. On Vercel this code path is covered by the
	// `x-forwarded-proto` header; the heuristic only matters on bare local dev,
	// where the hostname itself is the signal. Split off the port before comparing
	// so that `localhostapp.example.com` doesn't match as a false positive.
	const hostname = host.split(":")[0]

	if (hostname === "localhost" || hostname === "127.0.0.1") {
		return "http"
	}

	return "https"
}

/**
 * Returns the canonical site origin for the current request.
 *
 * Order of precedence:
 *   1. The `host` header — every Next runtime sets this; covers production.
 *   2. `VERCEL_URL` — fallback for paths that race the `headers()` await
 *      (e.g. a misconfigured reverse proxy stripping `Host`), so sitemap and
 *      feed generation 500 only when the deploy is genuinely missing.
 *
 * `x-forwarded-proto` overrides the protocol heuristic so reverse proxies
 * advertising the right scheme are respected.
 */
export async function siteBase(): Promise<string> {
	const h = await headers()
	const host = h.get("host")
	const proto = h.get("x-forwarded-proto")

	if (host !== null && host !== "") {
		return `${proto ?? defaultProto(host)}://${host}`
	}

	const vercelHost = process.env.VERCEL_URL

	if (vercelHost != null && vercelHost !== "") {
		return `${proto ?? "https"}://${vercelHost}`
	}

	throw new Error("Missing host header (and no VERCEL_URL fallback)")
}
