// Tracks whether the most recent navigation was a browser back/forward (a
// history "traverse") versus a fresh push/replace. Entrance animations read
// this so returning to a page via back/forward stays still instead of replaying
// the fade as if it were a first visit.
//
// Next.js App Router remounts the route subtree on back/forward, so Framer
// Motion would otherwise run every `initial → animate` again — there's no
// bfcache for soft navigations to lean on.

let cameFromBackForward = false
let isInstalled = false

/** Whether the current render follows a browser back/forward navigation. */
export function isBackForwardNavigation(): boolean {
	return cameFromBackForward
}

/**
 * Mirrors the last navigation's type into a module flag via the Navigation
 * API's `currententrychange` event, which reports `navigationType` for every
 * entry change — including Next's `history.pushState` route changes. That tells
 * back/forward ("traverse") apart from a fresh push/replace without patching the
 * History API.
 *
 * Idempotent and a no-op on the server or in browsers without the Navigation
 * API (Firefox, older Safari), where the entrance animation simply keeps
 * replaying on back as it did before — a benign degradation.
 */
export function installNavigationTypeTracking(): void {
	if (isInstalled || typeof window === "undefined") {
		return
	}

	// The Navigation API isn't in TS 5's `lib.dom`, so reach for it through a
	// cast. `navigation` is absent in browsers that don't ship the API (Firefox,
	// older Safari), where the entrance animation just keeps replaying on back.
	const navigation = (window as unknown as { navigation?: EventTarget })
		.navigation

	if (!navigation) {
		return
	}

	isInstalled = true

	navigation.addEventListener("currententrychange", (event) => {
		const navigationType = (event as { navigationType?: string }).navigationType

		cameFromBackForward = navigationType === "traverse"
	})
}
