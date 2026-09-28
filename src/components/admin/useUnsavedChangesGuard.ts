"use client"

import { useEffect, useState } from "react"
import {
	confirmDiscardUnsavedChanges,
	setHasUnsavedChanges,
} from "@/lib/client/unsavedChanges"

/**
 * Asks before the admin leaves a form with unsaved edits, on the three ways out
 * a page can intercept:
 *
 * - closing or reloading the tab, or leaving for another site: the browser's
 *   own `beforeunload` dialog, whose text the page can't set;
 * - clicking an in-app link (AdminNav, a tab, an Edit link): a confirm dialog,
 *   from one capture-phase listener on `document`, so it runs before React's
 *   root listener and before Next's `<Link>` handler, and stopping the event
 *   there stops the navigation;
 * - Logout, which is a button: `AdminNav` asks through the shared registry.
 *
 * The browser's Back button is not covered: the App Router gives a page no way
 * to cancel a history navigation.
 *
 * The guard stays on while a save is in flight on purpose: leaving then
 * unmounts the form, which aborts the request. Once a save succeeds, the form
 * passes `false` (`useAdminResource`'s `hasSucceeded`), so nothing prompts
 * while the list renders: the save's own `router.push` is not a click, and a
 * click or tab close in that gap would otherwise warn about stored edits.
 */
export function useUnsavedChangesGuard(isDirty: boolean): void {
	const [id] = useState(() => Symbol("form"))

	useEffect(() => {
		if (!isDirty) {
			return
		}

		setHasUnsavedChanges(id, true)

		function handleBeforeUnload(event: BeforeUnloadEvent) {
			event.preventDefault()
			// Older Chromium and Safari still read this instead of preventDefault.
			event.returnValue = ""
		}

		function handleClickCapture(event: MouseEvent) {
			if (!isLeavingInApp(event) || confirmDiscardUnsavedChanges()) {
				return
			}

			event.preventDefault()
			event.stopPropagation()
		}

		window.addEventListener("beforeunload", handleBeforeUnload)
		document.addEventListener("click", handleClickCapture, true)

		return () => {
			setHasUnsavedChanges(id, false)
			window.removeEventListener("beforeunload", handleBeforeUnload)
			document.removeEventListener("click", handleClickCapture, true)
		}
	}, [id, isDirty])
}

/**
 * Whether a click follows a link to another page of this site in this tab.
 * Everything else is left alone: a modified or middle click opens a new tab and
 * keeps the form; a link to another site, or with a `target`, is either a new
 * tab or a full unload that `beforeunload` covers; a hash-only link stays on
 * the page.
 */
function isLeavingInApp(event: MouseEvent): boolean {
	if (
		event.defaultPrevented ||
		event.button !== 0 ||
		event.metaKey ||
		event.ctrlKey ||
		event.shiftKey ||
		event.altKey
	) {
		return false
	}

	const anchor =
		event.target instanceof Element ? event.target.closest("a[href]") : null

	if (!(anchor instanceof HTMLAnchorElement)) {
		return false
	}

	if (
		(anchor.target !== "" && anchor.target !== "_self") ||
		anchor.hasAttribute("download")
	) {
		return false
	}

	const destination = new URL(anchor.href, window.location.href)

	if (destination.origin !== window.location.origin) {
		return false
	}

	return (
		destination.pathname !== window.location.pathname ||
		destination.search !== window.location.search
	)
}
