export type Theme = "light" | "dark" | "system"

// Valid cookie values — "system" is encoded with its resolved dark/light
// suffix so the server can set the correct class without a second cookie.
const cookieToThemeClass = {
	light: "light",
	dark: "dark",
	"system-light": "light",
	"system-dark": "dark",
} as const

type ThemeCookieValue = keyof typeof cookieToThemeClass

function isThemeCookieValue(value: unknown): value is ThemeCookieValue {
	return typeof value === "string" && value in cookieToThemeClass
}

/**
 * Resolves the raw `theme` cookie value to the `html` element class the
 * server should render. Returns `null` for first-time visitors (no cookie)
 * so `globals.css` can hide the page until client JS resolves a theme.
 */
export function resolveInitialThemeClass(
	rawCookie: string | undefined
): "light" | "dark" | null {
	if (!isThemeCookieValue(rawCookie)) {
		return null
	}

	return cookieToThemeClass[rawCookie]
}

/**
 * Resolves the raw `theme` cookie value to the user's preference
 * (`"light" | "dark" | "system"`), defaulting to `"system"`.
 */
export function resolveInitialTheme(rawCookie: string | undefined): Theme {
	if (rawCookie === "light" || rawCookie === "dark") {
		return rawCookie
	}

	return "system"
}
