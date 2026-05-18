/**
 * Drops analytics events for any pathname under `/admin`. Anchored on the
 * parsed pathname so a legitimate `/blog/tech/admin-tools` post is never
 * silently filtered.
 */
export function filterAdminEvents<T extends { url: string }>(
	event: T
): T | null {
	let pathname: string

	try {
		pathname = new URL(event.url).pathname
	} catch {
		// Relative URL: split off query string and fragment so `/admin#section`
		// (no `?`) is correctly classified as an admin pathname.
		pathname = event.url.split("?")[0].split("#")[0] ?? ""
	}

	if (pathname === "/admin" || pathname.startsWith("/admin/")) {
		return null
	}

	return event
}
