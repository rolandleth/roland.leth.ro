import { screen } from "@testing-library/react"
import { expect, type Mock } from "vitest"
import { isUnloadGuarded } from "@/test/unsavedChanges"

/**
 * Asserts the state an admin form must be left in after a failed save: the
 * server's message announced as an alert, Save usable again, no navigation
 * away, and the unsaved-changes guard still armed — the edits were not stored.
 *
 * `message` is the exact text `readErrorMessage` renders, status suffix
 * included, so a stub that drops the status fails here instead of passing on
 * a loose match.
 */
export async function expectFailedSave({
	message,
	push,
	saveButton,
}: {
	message: string
	push: Mock
	saveButton: RegExp
}) {
	expect(await screen.findByText(message)).toHaveAttribute("role", "alert")
	expect(screen.getByRole("button", { name: saveButton })).toBeEnabled()
	expect(push).not.toHaveBeenCalled()
	expect(isUnloadGuarded()).toBe(true)
}
