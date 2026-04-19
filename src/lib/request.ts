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

export async function siteBase(): Promise<string> {
	const h = await headers()
	const host = h.get("host")

	if (!host) {
		throw new Error("Missing host header")
	}

	const proto = h.get("x-forwarded-proto") ?? defaultProto(host)

	return `${proto}://${host}`
}
