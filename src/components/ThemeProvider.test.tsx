import { act, render, renderHook, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ThemeProvider, { useTheme } from "./ThemeProvider"

describe("ThemeProvider", () => {
	it("applies `light` class to <html> when initialTheme is light", () => {
		render(
			<ThemeProvider initialTheme="light">
				<div data-testid="child" />
			</ThemeProvider>
		)
		expect(document.documentElement).toHaveClass("light")
	})

	it("applies `dark` class to <html> when initialTheme is dark", () => {
		render(
			<ThemeProvider initialTheme="dark">
				<div data-testid="child" />
			</ThemeProvider>
		)
		expect(document.documentElement).toHaveClass("dark")
	})

	it("renders its children", () => {
		render(
			<ThemeProvider initialTheme="light">
				<div data-testid="child">hello</div>
			</ThemeProvider>
		)
		expect(screen.getByTestId("child")).toHaveTextContent("hello")
	})

	it("writes a `theme` cookie reflecting the resolved theme", () => {
		render(
			<ThemeProvider initialTheme="dark">
				<div />
			</ThemeProvider>
		)
		// Server can rehydrate the right class on next load from the cookie.
		expect(document.cookie).toMatch(/theme=dark/)
	})

	it("encodes 'system' as system-dark or system-light in the cookie", () => {
		render(
			<ThemeProvider initialTheme="system">
				<div />
			</ThemeProvider>
		)
		// Server uses the dark/light suffix to set the right class without a
		// second cookie roundtrip.
		expect(document.cookie).toMatch(/theme=system-(dark|light)/)
	})
})

describe("ThemeProvider — useSyncExternalStore (Phase 8)", () => {
	// Phase 8 refactor: the prior `useEffect` + `useState` mirror went stale
	// when the user toggled system → light → system; the resubscribe re-armed
	// the listener but kept the captured value from before. `useSyncExternalStore`
	// re-reads `window.matchMedia(...).matches` on every render, so the value
	// can never drift. This block pins that contract.

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

	afterEach(() => {
		// Reset between tests so the cookie + html class don't leak.
		document.documentElement.classList.remove("light", "dark")
	})

	it("subscribes to prefers-color-scheme on mount", () => {
		render(
			<ThemeProvider initialTheme="system">
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
			<ThemeProvider initialTheme="system">
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
			<ThemeProvider initialTheme="system">
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
