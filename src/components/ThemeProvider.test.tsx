import { render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
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
