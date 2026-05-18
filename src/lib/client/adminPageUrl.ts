export const ADMIN_TABS = ["posts", "projects"] as const
export type AdminTab = (typeof ADMIN_TABS)[number]

export function parseTab(raw: string | undefined): AdminTab {
	if (raw != null && (ADMIN_TABS as readonly string[]).includes(raw)) {
		return raw as AdminTab
	}

	return "posts"
}

/**
 * Builds the canonical `/admin?...` URL for a given tab/query/page combination.
 * `tab=posts` is the default, so it's omitted from the query string. Empty
 * query and `page=1` are also omitted to keep the canonical URL clean.
 */
export function buildAdminPageUrl({
	tab,
	query,
	page,
}: {
	tab: AdminTab
	query: string
	page: number
}): string {
	const params = new URLSearchParams()

	if (tab !== "posts") {
		params.set("tab", tab)
	}

	if (query.length > 0) {
		params.set("q", query)
	}

	if (page > 1) {
		params.set("page", String(page))
	}

	const qs = params.toString()

	return qs ? `/admin?${qs}` : "/admin"
}
