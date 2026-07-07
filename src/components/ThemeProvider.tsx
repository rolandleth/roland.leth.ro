"use client"

import {
	createContext,
	useContext,
	useEffect,
	useState,
	useSyncExternalStore,
} from "react"
import { readStoredTheme, THEME_STORAGE_KEY } from "@/lib/client/theme"
import type { Theme } from "@/lib/client/theme"

export type { Theme } from "@/lib/client/theme"

interface ThemeContextValue {
	theme: Theme
	isThemeDark: boolean
	setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
	const context = useContext(ThemeContext)

	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider")
	}

	return context
}

function applyTheme(isDark: boolean) {
	document.documentElement.classList.remove("light", "dark")
	document.documentElement.classList.add(isDark ? "dark" : "light")
}

function subscribeToColorScheme(notify: () => void): () => void {
	const media = window.matchMedia("(prefers-color-scheme: dark)")
	media.addEventListener("change", notify)
	return () => media.removeEventListener("change", notify)
}

function getColorSchemeSnapshot(): boolean {
	return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function getServerColorSchemeSnapshot(): boolean {
	// SSR fallback — the server can't read the OS preference; resolution
	// happens client-side on first paint via this hook's subscribe path.
	return false
}

export default function ThemeProvider({
	children,
}: {
	children: React.ReactNode
}) {
	// Read the stored preference in the initializer so the client's first render
	// already matches the class the inline theme script set pre-paint — no
	// post-mount flip. On the server this returns "system" (no localStorage);
	// only `ThemeToggle` renders theme-dependent DOM and it guards on mount, so
	// there is no hydration mismatch.
	const [theme, setTheme] = useState<Theme>(readStoredTheme)
	// `useSyncExternalStore` reads the media-query value at every render so it
	// can never go stale when the OS preference changes while a non-"system"
	// theme is active.
	const systemIsDark = useSyncExternalStore(
		subscribeToColorScheme,
		getColorSchemeSnapshot,
		getServerColorSchemeSnapshot
	)

	const isDark = theme === "dark" || (theme === "system" && systemIsDark)

	useEffect(() => {
		applyTheme(isDark)
	}, [isDark])

	// Persist the raw preference ("light"/"dark"/"system"); the inline script
	// reads it on the next load.
	useEffect(() => {
		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, theme)
		} catch {
			// Storage blocked (e.g. Safari private mode) — the preference just
			// won't persist; the live session still works.
		}
	}, [theme])

	return (
		<ThemeContext.Provider value={{ theme, isThemeDark: isDark, setTheme }}>
			{children}
		</ThemeContext.Provider>
	)
}
