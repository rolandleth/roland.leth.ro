export type Theme = "light" | "dark" | "system"

/** localStorage key holding the user's theme preference. */
export const THEME_STORAGE_KEY = "theme"

const THEMES: readonly Theme[] = ["light", "dark", "system"]

/** Narrows an arbitrary value to a valid `Theme`. */
export function isTheme(value: unknown): value is Theme {
	return (
		typeof value === "string" && (THEMES as readonly string[]).includes(value)
	)
}

/**
 * Reads the stored theme preference, defaulting to `"system"`. SSR-safe:
 * returns the default when `window`/`localStorage` is unavailable (server
 * render, or a browser blocking storage in private mode).
 *
 * The pre-paint `<html>` class is set by the inline theme script in
 * `layout.tsx`, which duplicates this resolution because it must run before any
 * module loads and so can't import this file — keep the two in sync.
 */
export function readStoredTheme(): Theme {
	if (typeof window === "undefined") {
		return "system"
	}

	try {
		const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
		return isTheme(stored) ? stored : "system"
	} catch {
		// Storage blocked (e.g. Safari private mode) — fall back to the default.
		return "system"
	}
}
