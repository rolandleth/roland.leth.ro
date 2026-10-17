import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import WeeklyGymPrivacyPage from "./page"

describe("Weekly Gym privacy page", () => {
	it("asks readers to contact us, at Weekly Gym's address", () => {
		render(<WeeklyGymPrivacyPage />)

		expect(screen.getByRole("link", { name: "contact us" })).toHaveAttribute(
			"href",
			"mailto:roland+weeklygym@leth.ro"
		)
	})

	it("links to the terms of use from Related", () => {
		render(<WeeklyGymPrivacyPage />)

		expect(screen.getByRole("link", { name: "Terms of use" })).toHaveAttribute(
			"href",
			"/terms/weekly-gym"
		)
	})

	// The app gives iOS exercise names for Siri and the Action button, so the
	// page must not claim, as Digest's does, that data only leaves the device
	// through iCloud; and it must say what iOS gets.
	it("says what Siri gets, and never that data only leaves through iCloud", () => {
		const { container } = render(<WeeklyGymPrivacyPage />)

		expect(container.textContent).toMatch(/gives iOS the names of this week/)
		expect(container.textContent).not.toMatch(/only leaves your device/)
	})
})
