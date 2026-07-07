// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import { isTheme, readStoredTheme, THEME_STORAGE_KEY } from "@/lib/client/theme"

// #region isTheme

describe("isTheme", () => {
	it("accepts the three valid themes", () => {
		expect(isTheme("light")).toBe(true)
		expect(isTheme("dark")).toBe(true)
		expect(isTheme("system")).toBe(true)
	})

	it("rejects unknown strings and non-strings", () => {
		expect(isTheme("sepia")).toBe(false)
		expect(isTheme("")).toBe(false)
		expect(isTheme(null)).toBe(false)
		expect(isTheme(undefined)).toBe(false)
		expect(isTheme(1)).toBe(false)
	})
})

// #endregion

// #region readStoredTheme

describe("readStoredTheme", () => {
	afterEach(() => {
		window.localStorage.clear()
	})

	it("returns the stored preference when it is a valid theme", () => {
		window.localStorage.setItem(THEME_STORAGE_KEY, "dark")
		expect(readStoredTheme()).toBe("dark")
	})

	it("defaults to 'system' when nothing is stored", () => {
		expect(readStoredTheme()).toBe("system")
	})

	it("defaults to 'system' for an invalid stored value", () => {
		window.localStorage.setItem(THEME_STORAGE_KEY, "sepia")
		expect(readStoredTheme()).toBe("system")
	})
})

// #endregion
