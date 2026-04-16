import { headers } from "next/headers"

function defaultProto(host: string): "http" | "https" {
	if (host.startsWith("localhost") || host.includes(":")) {
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
