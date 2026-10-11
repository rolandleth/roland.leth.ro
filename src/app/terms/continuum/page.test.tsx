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
		expect(container.textContent).not.toMatch(/as is/i)
	})

	// The body speaks as "I" ("not by me", "I'm not liable"), so the contact
	// line does too.
	it("asks readers to contact me, at Continuum's address", () => {
		render(<ContinuumTermsPage />)

		expect(screen.getByRole("link", { name: "contact me" })).toHaveAttribute(
			"href",
			"mailto:roland+continuum@leth.ro"
		)
	})
})
