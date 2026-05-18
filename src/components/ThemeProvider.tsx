"use client"

import {
	createContext,
	useContext,
	useEffect,
	useState,
	useSyncExternalStore,
} from "react"
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
	initialTheme,
	children,
}: {
	initialTheme: Theme
	children: React.ReactNode
}) {
	const [theme, setTheme] = useState<Theme>(initialTheme)
	// `useSyncExternalStore` reads the media-query value at every render so it
	// can never go stale when the OS preference changes while a non-"system"
	// theme is active. Earlier we mirrored the value into local state seeded
	// from the snapshot at first mount; that snapshot went stale across theme
	// → light → system flips because the subscription effect's re-attach did
	// not refresh the captured value.
	const systemIsDark = useSyncExternalStore(
		subscribeToColorScheme,
		getColorSchemeSnapshot,
		getServerColorSchemeSnapshot
	)

	const isDark = theme === "dark" || (theme === "system" && systemIsDark)

	useEffect(() => {
		applyTheme(isDark)
	}, [isDark])

	// Sync cookie whenever theme preference or resolved dark state changes.
	// "system" is encoded as "system-dark" / "system-light" so the server can
	// set the correct class on the next load without a second cookie.
	useEffect(() => {
		const value =
			theme === "system" ? `system-${isDark ? "dark" : "light"}` : theme
		document.cookie = `theme=${value}; path=/; max-age=31536000; SameSite=Lax`
	}, [theme, isDark])

	return (
		<ThemeContext.Provider value={{ theme, isThemeDark: isDark, setTheme }}>
			{children}
		</ThemeContext.Provider>
	)
}
