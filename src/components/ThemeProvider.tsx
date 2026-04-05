"use client"

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react"

export type Theme = "light" | "dark" | "system"

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

export default function ThemeProvider({
	initialTheme,
	children,
}: {
	initialTheme: Theme
	children: React.ReactNode
}) {
	const [theme, setThemeState] = useState<Theme>(initialTheme)
	const [systemIsDark, setSystemIsDark] = useState(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches
	)

	const isDark = theme === "dark" || (theme === "system" && systemIsDark)

	useEffect(() => {
		applyTheme(isDark)
	}, [isDark])

	useEffect(() => {
		if (theme !== "system") {
			return
		}

		const media = window.matchMedia("(prefers-color-scheme: dark)")

		const handleChange = (e: MediaQueryListEvent) => {
			setSystemIsDark(e.matches)
		}

		media.addEventListener("change", handleChange)

		return () => media.removeEventListener("change", handleChange)
	}, [theme])

	// Sync cookie whenever theme preference or resolved dark state changes.
	// "system" is encoded as "system-dark" / "system-light" so the server can
	// set the correct class on the next load without a second cookie.
	useEffect(() => {
		const value =
			theme === "system" ? `system-${isDark ? "dark" : "light"}` : theme
		document.cookie = `theme=${value}; path=/; max-age=31536000; SameSite=Lax`
	}, [theme, isDark])

	const setTheme = useCallback((next: Theme) => {
		setThemeState(next)
	}, [])

	return (
		<ThemeContext.Provider value={{ theme, isThemeDark: isDark, setTheme }}>
			{children}
		</ThemeContext.Provider>
	)
}
