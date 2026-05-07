import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import ThemeProvider from "./ThemeProvider"
import ThemeToggle from "./ThemeToggle"

function renderWithProvider(
	initialTheme: "light" | "dark" | "system" = "light"
) {
	return render(
		<ThemeProvider initialTheme={initialTheme}>
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

		await userEvent.click(screen.getByRole("button", { name: /dark theme/i }))

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
		await userEvent.click(screen.getByRole("button", { name: /dark theme/i }))

		expect(document.documentElement).toHaveClass("dark")
		expect(document.documentElement).not.toHaveClass("light")
	})
})
