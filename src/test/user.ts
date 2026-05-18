import userEvent from "@testing-library/user-event"

// `delay: null` removes user-event v14's per-keystroke `setTimeout(0)`, which
// dominates wall-clock time in input-heavy tests.
export function setupUser() {
	return userEvent.setup({ delay: null })
}
