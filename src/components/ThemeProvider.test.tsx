import { act, render, renderHook, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { THEME_STORAGE_KEY } from "@/lib/client/theme"
import ThemeProvider, { useTheme } from "./ThemeProvider"

afterEach(() => {
	document.documentElement.classList.remove("light", "dark")
	window.localStorage.clear()
})

describe("ThemeProvider", () => {
	it("applies the stored `light` preference to <html>", () => {
		window.localStorage.setItem(THEME_STORAGE_KEY, "light")
		render(
			<ThemeProvider>
				<div data-testid="child" />
			</ThemeProvider>
		)
		expect(document.documentElement).toHaveClass("light")
	})

	it("applies the stored `dark` preference to <html>", () => {
		window.localStorage.setItem(THEME_STORAGE_KEY, "dark")
		render(
			<ThemeProvider>
				<div data-testid="child" />
			</ThemeProvider>
		)
		expect(document.documentElement).toHaveClass("dark")
	})

	it("renders its children", () => {
		render(
			<ThemeProvider>
				<div data-testid="child">hello</div>
			</ThemeProvider>
		)
		expect(screen.getByTestId("child")).toHaveTextContent("hello")
	})

	it("defaults to and persists 'system' when nothing is stored", () => {
		render(
			<ThemeProvider>
				<div />
			</ThemeProvider>
		)
		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system")
	})

	it("writes the new preference to localStorage and <html> when setTheme runs", () => {
		const { result } = renderHook(() => useTheme(), {
			wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
		})

		act(() => {
			result.current.setTheme("dark")
		})

		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")
		expect(document.documentElement).toHaveClass("dark")
	})
})

describe("ThemeProvider — useSyncExternalStore", () => {
	// The prior `useEffect` + `useState` mirror went stale when the user toggled
	// system → light → system; the resubscribe re-armed the listener but kept the
	// captured value from before. `useSyncExternalStore` re-reads
	// `window.matchMedia(...).matches` on every render, so the value can never
	// drift. This block pins that contract.

	type MediaQueryListLike = {
		matches: boolean
		addEventListener: ReturnType<typeof vi.fn>
		removeEventListener: ReturnType<typeof vi.fn>
		media: string
		onchange: null
		dispatchEvent: ReturnType<typeof vi.fn>
		addListener: ReturnType<typeof vi.fn>
		removeListener: ReturnType<typeof vi.fn>
	}

	let mediaQueryList: MediaQueryListLike
	let changeListeners: Array<(event: { matches: boolean }) => void>

	beforeEach(() => {
		changeListeners = []
		mediaQueryList = {
			matches: false,
			media: "(prefers-color-scheme: dark)",
			onchange: null,
			addEventListener: vi.fn((event: string, listener: unknown) => {
				if (event === "change") {
					changeListeners.push(
						listener as (event: { matches: boolean }) => void
					)
				}
			}),
			removeEventListener: vi.fn((event: string, listener: unknown) => {
				if (event === "change") {
					changeListeners = changeListeners.filter((l) => l !== listener)
				}
			}),
			dispatchEvent: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
		}

		window.matchMedia = vi.fn().mockImplementation(() => mediaQueryList)
	})

	it("subscribes to prefers-color-scheme on mount", () => {
		render(
			<ThemeProvider>
				<div />
			</ThemeProvider>
		)
		expect(mediaQueryList.addEventListener).toHaveBeenCalledWith(
			"change",
			expect.any(Function)
		)
	})

	it("updates the html class when the OS preference flips while theme is 'system'", () => {
		mediaQueryList.matches = false
		render(
			<ThemeProvider>
				<div />
			</ThemeProvider>
		)
		expect(document.documentElement).toHaveClass("light")

		// OS flips to dark — useSyncExternalStore re-reads via its snapshot fn.
		act(() => {
			mediaQueryList.matches = true
			changeListeners.forEach((listener) => listener({ matches: true }))
		})

		expect(document.documentElement).toHaveClass("dark")
	})

	it("removes the listener on unmount (no leak across remounts)", () => {
		const { unmount } = render(
			<ThemeProvider>
				<div />
			</ThemeProvider>
		)
		unmount()
		expect(mediaQueryList.removeEventListener).toHaveBeenCalledWith(
			"change",
			expect.any(Function)
		)
	})
})

describe("useTheme", () => {
	it("throws when used outside of ThemeProvider", () => {
		// Pinning the safety net: a dev typo using useTheme in a component that
		// isn't under the provider should fail loudly, not silently return
		// undefined.
		expect(() => renderHook(() => useTheme())).toThrow(
			/must be used within a ThemeProvider/
		)
	})
})
