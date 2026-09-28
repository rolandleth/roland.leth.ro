import { buildAdminPageUrl, parseTab, type AdminTab } from "./adminPageUrl"

const STORAGE_KEY = "admin:lastListUrl"

/**
 * Remembers the dashboard list the admin is looking at (tab, search and page),
 * so a form can return to it after a save or delete instead of to page 1 of
 * the Posts tab. Per tab session, via `sessionStorage`: a new tab starts from
 * the default list, which is what a fresh visit shows anyway.
 */
export function rememberAdminListUrl(url: string): void {
	try {
		window.sessionStorage.setItem(STORAGE_KEY, url)
	} catch (error) {
		// Storage can be blocked (private mode, disabled site data). The form
		// then returns to the tab's first page, which is the old behaviour.
		// eslint-disable-next-line no-console
		console.warn("[adminListReturn] could not remember the list URL", error)
	}
}

/**
 * The list to return to for a resource on `tab`: the remembered one when it
 * shows that tab, otherwise the tab's first page.
 *
 * - A remembered list on another tab is ignored: it can't show the item at all.
 * - After a create, the tab's first page, with no search: a remembered search
 *   was typed before the item existed, and would likely hide it.
 * - After an edit or a delete, the remembered search and page stay, so the
 *   admin carries on where they were. An edit that stops matching the search
 *   drops out of it, as any search result would.
 */
export function adminListUrlFor(
	tab: AdminTab,
	{ isAfterCreate }: { isAfterCreate: boolean }
): string {
	const fallback = buildAdminPageUrl({ tab, query: "", page: 1 })

	if (isAfterCreate) {
		return fallback
	}

	const remembered = readRememberedUrl()

	if (remembered == null) {
		return fallback
	}

	return tabOf(remembered) === tab ? remembered : fallback
}

function readRememberedUrl(): string | null {
	let value: string | null

	try {
		value = window.sessionStorage.getItem(STORAGE_KEY)
	} catch (error) {
		// eslint-disable-next-line no-console
		console.warn("[adminListReturn] could not read the list URL", error)

		return null
	}

	// Only ever a dashboard URL this module wrote; anything else is ignored
	// rather than navigated to.
	if (value == null || !isDashboardUrl(value)) {
		return null
	}

	return value
}

function isDashboardUrl(value: string): boolean {
	return value === "/admin" || value.startsWith("/admin?")
}

function tabOf(url: string): AdminTab {
	const queryIndex = url.indexOf("?")
	const params = new URLSearchParams(
		queryIndex === -1 ? "" : url.slice(queryIndex + 1)
	)

	return parseTab(params.get("tab") ?? undefined)
}
