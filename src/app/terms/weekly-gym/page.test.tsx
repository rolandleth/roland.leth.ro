import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import WeeklyGymTermsPage from "./page"

describe("Weekly Gym terms page", () => {
	// The app's only health line (`LegalInfo.healthLine` in the Weekly Gym
	// repo). The terms repeat it word for word, so the two never disagree.
	it("carries the app's health line word for word", () => {
		const { container } = render(<WeeklyGymTermsPage />)

		expect(container.textContent).toContain(
			"Weekly Gym shares general training information. If you have an injury or a health condition, check with a professional before starting."
		)
	})

	// The body speaks as "we" ("not by us", "we're not liable"), so the contact
	// line does too.
	it("asks readers to contact us, at Weekly Gym's address", () => {
		render(<WeeklyGymTermsPage />)

		expect(screen.getByRole("link", { name: "contact us" })).toHaveAttribute(
			"href",
			"mailto:roland+weeklygym@leth.ro"
		)
	})

	it("links to the privacy policy, from Your data and from Related", () => {
		render(<WeeklyGymTermsPage />)

		expect(
			screen.getByRole("link", { name: "privacy policy" })
		).toHaveAttribute("href", "/privacy/weekly-gym")
		expect(
			screen.getByRole("link", { name: "Privacy policy" })
		).toHaveAttribute("href", "/privacy/weekly-gym")
	})

	// Purchases aren't decided yet: the page must not promise tiers or prices.
	it("speaks of purchases only in general terms", () => {
		const { container } = render(<WeeklyGymTermsPage />)

		expect(container.textContent).not.toMatch(/\bPro\b|lifetime|\$|€/)
	})
})
