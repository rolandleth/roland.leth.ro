import { describe, expect, it } from "vitest"
import { resolveInitialTheme, resolveInitialThemeClass } from "@/lib/theme"

// #region resolveInitialThemeClass

describe("resolveInitialThemeClass", () => {
	it("returns null for a missing cookie (first-time visitor)", () => {
		expect(resolveInitialThemeClass(undefined)).toBeNull()
	})

	it("returns null for an empty string", () => {
		expect(resolveInitialThemeClass("")).toBeNull()
	})

	it("returns null for an unknown cookie value", () => {
		expect(resolveInitialThemeClass("sepia")).toBeNull()
	})

	it("returns 'light' for the plain 'light' cookie", () => {
		expect(resolveInitialThemeClass("light")).toBe("light")
	})

	it("returns 'dark' for the plain 'dark' cookie", () => {
		expect(resolveInitialThemeClass("dark")).toBe("dark")
	})

	it("resolves 'system-light' to the 'light' class", () => {
		expect(resolveInitialThemeClass("system-light")).toBe("light")
	})

	it("resolves 'system-dark' to the 'dark' class", () => {
		expect(resolveInitialThemeClass("system-dark")).toBe("dark")
	})

	it("returns null for the bare 'system' string (no resolved suffix)", () => {
		// The cookie is only ever written with the resolved suffix, so a bare
		// "system" is treated as malformed — fall back to no-class so CSS can
		// hide the page until client JS picks a theme.
		expect(resolveInitialThemeClass("system")).toBeNull()
	})
})

// #endregion

// #region resolveInitialTheme

describe("resolveInitialTheme", () => {
	it("defaults to 'system' when there is no cookie", () => {
		expect(resolveInitialTheme(undefined)).toBe("system")
	})

	it("defaults to 'system' for an empty string", () => {
		expect(resolveInitialTheme("")).toBe("system")
	})

	it("returns 'light' for the plain 'light' cookie", () => {
		expect(resolveInitialTheme("light")).toBe("light")
	})

	it("returns 'dark' for the plain 'dark' cookie", () => {
		expect(resolveInitialTheme("dark")).toBe("dark")
	})

	it("collapses 'system-light' back to the 'system' preference", () => {
		// The suffix is only a rendering hint; the user's stored preference is
		// still "system". Otherwise toggling OS theme wouldn't be respected.
		expect(resolveInitialTheme("system-light")).toBe("system")
	})

	it("collapses 'system-dark' back to the 'system' preference", () => {
		expect(resolveInitialTheme("system-dark")).toBe("system")
	})

	it("defaults to 'system' for any unknown value", () => {
		expect(resolveInitialTheme("sepia")).toBe("system")
	})
})

// #endregion
