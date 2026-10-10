import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import ContinuumTermsPage from "./page"

describe("Continuum terms page", () => {
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
