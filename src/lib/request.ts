import { headers } from "next/headers"

export async function siteBase(): Promise<string> {
	const h = await headers()
	const host = h.get("host")

	if (!host) {
		throw new Error("Missing host header")
	}

	const proto = h.get("x-forwarded-proto") ?? "https"

	return `${proto}://${host}`
}
