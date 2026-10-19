import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import ContinuumTermsPage from "./page"

describe("Continuum terms page", () => {
	// "As is, without warranties" doesn't bind EU or UK consumers for paid
	// features, so the page says what the app is instead of disclaiming it.
	it("says what Continuum is rather than disclaiming every warranty", () => {
		const { container } = render(<ContinuumTermsPage />)

		expect(
			screen.getByRole("heading", { level: 2, name: "What Continuum is" })
		).toBeInTheDocument()
		// Whole words: "has issues" or "was issued" mustn't trip it.
		expect(container.textContent).not.toMatch(/\bas is\b/i)
	})

	// Every legal page speaks as "we" ("not by us", "we're not liable"), and
	// the contact line with it.
	it("asks readers to contact us, at Continuum's address", () => {
		render(<ContinuumTermsPage />)

		expect(screen.getByRole("link", { name: "contact us" })).toHaveAttribute(
			"href",
			"mailto:roland+continuum@leth.ro"
		)
	})

	it("speaks as 'we', never 'I' or 'me'", () => {
		const { container } = render(<ContinuumTermsPage />)

		expect(container.textContent).not.toMatch(/\b(I|I'm|me|my)\b/)
	})
})
