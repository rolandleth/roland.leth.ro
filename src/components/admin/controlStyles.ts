// Shared Tailwind class strings for admin dashboard controls, so the panels
// (Revalidate, IndexNow, …) can't drift apart button-by-button. Class strings
// rather than wrapper components: the panels compose their own markup, and a
// shared string is the smaller thing to keep in sync.

/** Bordered secondary button: hover accent, disabled dimming. */
export const adminButtonClass =
	"border-border cursor-pointer rounded-md border px-3 py-1.5 text-sm text-secondary transition-colors hover:text-(--color-accent) disabled:cursor-not-allowed disabled:opacity-50"

/** Free-text input inside a panel row. */
export const adminInputClass =
	"border-border bg-background text-primary min-w-0 flex-1 rounded-md border px-2 py-1.5 font-mono text-sm"

/** Outer shell of a dashboard panel. */
export const adminPanelClass =
	"border-border flex flex-col gap-4 rounded-lg border p-4"

/** Panel heading. */
export const adminPanelTitleClass = "text-primary text-sm font-semibold"

/** Explanatory copy under a panel heading. */
export const adminPanelDescriptionClass = "text-secondary mt-1 text-xs"

/** The result line a panel writes after a completed action. */
export const adminResultClass = "text-secondary text-xs"

/** Non-fatal advisory: the server did something other than what was asked. */
export const adminWarningClass = "text-xs text-amber-600 dark:text-amber-400"

/**
 * The `role="status"` live region a panel writes its result + warnings into.
 * `empty:hidden` collapses it while empty so it doesn't add a stray gap, but it
 * stays mounted — a live region has to exist before its content arrives.
 */
export const adminOutcomeClass = "flex flex-col gap-1 empty:hidden"
