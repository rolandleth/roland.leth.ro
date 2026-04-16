export function filterAdminEvents<T extends { url: string }>(
	event: T
): T | null {
	if (event.url.includes("/admin")) {
		return null
	}

	return event
}
