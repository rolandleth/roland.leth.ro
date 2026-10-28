import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import DigestPrivacyPage from "./page"

describe("Digest privacy page", () => {
	it("asks readers to contact us, at Digest's address", () => {
		render(<DigestPrivacyPage />)

		expect(screen.getByRole("link", { name: "contact us" })).toHaveAttribute(
			"href",
			"mailto:roland+digest@leth.ro"
		)
	})

	it("links to the terms of use from Related", () => {
		render(<DigestPrivacyPage />)

		expect(screen.getByRole("link", { name: "Terms of use" })).toHaveAttribute(
			"href",
			"/terms/digest"
		)
	})

	// Digest gives iOS its template names for Siri and Shortcuts, and a device
	// backup can carry the journal too, so data doesn't leave the device through
	// iCloud alone; the list has to name every way.
	it("names every way data leaves the device, Siri, Shortcuts and backups included", () => {
		const { container } = render(<DigestPrivacyPage />)

		expect(
			screen.getByRole("heading", { level: 2, name: "Siri and Shortcuts" })
		).toBeInTheDocument()
		expect(container.textContent).toMatch(
			/Digest gives iOS\s+the names of your templates/
		)
		expect(container.textContent).toMatch(
			/only leaves\s+your device through Apple's iCloud sync, through Siri and\s+Shortcuts as described below, in a device backup, or in a file you\s+export yourself\./
		)
	})

	it("says what Pro is sold as, and that payment details never reach us", () => {
		const { container } = render(<DigestPrivacyPage />)

		expect(
			screen.getByRole("heading", { level: 2, name: "Purchases" })
		).toBeInTheDocument()
		expect(container.textContent).toMatch(
			/a monthly or yearly subscription, or a one-time purchase/
		)
		expect(container.textContent).toMatch(
			/We never receive or store your payment\s+details/
		)
	})

	it("says Health is read only, and the weight it reads goes nowhere", () => {
		const { container } = render(<DigestPrivacyPage />)

		expect(container.textContent).toMatch(/It never writes to Apple Health/)
		expect(container.textContent).toMatch(
			/isn't synced, isn't\s+included in exports/
		)
	})
})
