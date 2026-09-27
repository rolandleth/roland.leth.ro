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
 * shows that tab, otherwise the tab's first page. A remembered list on another
 * tab is ignored, since returning there would hide the item just saved.
 */
export function adminListUrlFor(tab: AdminTab): string {
	const fallback = buildAdminPageUrl({ tab, query: "", page: 1 })
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
