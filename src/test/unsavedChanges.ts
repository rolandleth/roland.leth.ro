/**
 * Whether the page would ask before the tab closes: dispatches a cancelable
 * `beforeunload` and reports whether a listener cancelled it, which is what
 * `useUnsavedChangesGuard` does while its form has unsaved changes.
 */
export function isUnloadGuarded(): boolean {
	const event = new Event("beforeunload", { cancelable: true })
	window.dispatchEvent(event)

	return event.defaultPrevented
}
