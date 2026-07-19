// Shared Tailwind class strings for admin dashboard controls, so the panels
// (Revalidate, IndexNow, …) can't drift apart button-by-button.

/** Bordered secondary button: hover accent, disabled dimming. */
export const adminButtonClass =
	"border-border cursor-pointer rounded-md border px-3 py-1.5 text-sm text-secondary transition-colors hover:text-(--color-accent) disabled:cursor-not-allowed disabled:opacity-50"
