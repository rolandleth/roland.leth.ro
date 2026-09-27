/**
 * Which mounted forms hold unsaved edits. A registry rather than React state,
 * because the one caller outside the form, `AdminNav`'s Logout, sits in the
 * layout and shares no tree with the form it has to ask about.
 */
const dirtyForms = new Set<symbol>()

export const DISCARD_UNSAVED_CHANGES_MESSAGE =
	"You have unsaved changes. Leave and discard them?"

/** Records whether the form identified by `id` holds unsaved edits. */
export function setHasUnsavedChanges(id: symbol, isDirty: boolean): void {
	if (isDirty) {
		dirtyForms.add(id)
	} else {
		dirtyForms.delete(id)
	}
}

/**
 * Whether leaving the page may go ahead: `true` when no form holds unsaved
 * edits, otherwise the admin's answer to a confirm dialog.
 */
export function confirmDiscardUnsavedChanges(): boolean {
	if (dirtyForms.size === 0) {
		return true
	}

	return window.confirm(DISCARD_UNSAVED_CHANGES_MESSAGE)
}
