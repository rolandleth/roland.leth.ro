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

	// Weekly Gym Pro is named in full, and prices live in the app, never here:
	// they aren't decided, and the App Store shows them before a purchase.
	it("names Weekly Gym Pro in full and states no price", () => {
		const { container } = render(<WeeklyGymTermsPage />)
		const text = container.textContent ?? ""

		expect(text).toContain("Weekly Gym Pro")
		expect(text.replaceAll("Weekly Gym Pro", "")).not.toMatch(/\bPro\b/)
		expect(text).not.toMatch(/\$|€|£/)
	})
})
