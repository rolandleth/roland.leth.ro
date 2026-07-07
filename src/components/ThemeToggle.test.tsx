import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { THEME_STORAGE_KEY } from "@/lib/client/theme"
import { setupUser } from "@/test/user"
import ThemeProvider from "./ThemeProvider"
import ThemeToggle from "./ThemeToggle"

const user = setupUser()

afterEach(() => {
	document.documentElement.classList.remove("light", "dark")
	window.localStorage.clear()
})

function renderWithProvider(
	initialTheme: "light" | "dark" | "system" = "light"
) {
	window.localStorage.setItem(THEME_STORAGE_KEY, initialTheme)
	return render(
		<ThemeProvider>
			<ThemeToggle />
		</ThemeProvider>
	)
}

describe("ThemeToggle", () => {
	it("renders three options: System, Light, Dark", () => {
		renderWithProvider()
		expect(
			screen.getByRole("button", { name: /system theme/i })
		).toBeInTheDocument()
		expect(
			screen.getByRole("button", { name: /light theme/i })
		).toBeInTheDocument()
		expect(
			screen.getByRole("button", { name: /dark theme/i })
		).toBeInTheDocument()
	})

	it("marks the initial theme as pressed", () => {
		renderWithProvider("dark")
		expect(screen.getByRole("button", { name: /dark theme/i })).toHaveAttribute(
			"aria-pressed",
			"true"
		)
		expect(
			screen.getByRole("button", { name: /light theme/i })
		).toHaveAttribute("aria-pressed", "false")
	})

	it("shifts aria-pressed to the clicked option", async () => {
		renderWithProvider("light")

		await user.click(screen.getByRole("button", { name: /dark theme/i }))

		expect(screen.getByRole("button", { name: /dark theme/i })).toHaveAttribute(
			"aria-pressed",
			"true"
		)
		expect(
			screen.getByRole("button", { name: /light theme/i })
		).toHaveAttribute("aria-pressed", "false")
	})

	it("applies the dark class on the html element when dark is selected", async () => {
		renderWithProvider("light")
		await user.click(screen.getByRole("button", { name: /dark theme/i }))

		expect(document.documentElement).toHaveClass("dark")
		expect(document.documentElement).not.toHaveClass("light")
	})
})
