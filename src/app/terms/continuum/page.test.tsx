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

	// The yearly plan has a free trial, and Apple charges it when it ends, not
	// on confirm, so "charged when you confirm" alone would be false.
	it("says when the free trial is charged", () => {
		const { container } = render(<ContinuumTermsPage />)
		const text = (container.textContent ?? "").replace(/\s+/g, " ")

		expect(text).toContain(
			"Payment is charged to your Apple Account when you confirm the purchase or, after the free trial, when the trial ends."
		)
		expect(text).toContain(
			"Cancel at least 24 hours before the trial ends and nothing is charged."
		)
	})
})
