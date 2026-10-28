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

	// Sync follows the device's iCloud settings and the app has no switch of its
	// own, so the page states the condition and never that data stays on the device.
	it("says where data is stored, with the iCloud condition", () => {
		const { container } = render(<WeeklyGymPrivacyPage />)
		const text = (container.textContent ?? "").replace(/\s+/g, " ")

		expect(text).toContain("while iCloud is on for Weekly Gym, in your own iCloud account")
		expect(text).not.toMatch(/stays on your device/)
		expect(text).not.toMatch(/more than one plan/)
	})

	// Same rule as the terms: Weekly Gym Pro is named in full, and prices live in
	// the app, where the App Store shows them before a purchase.
	it("names Weekly Gym Pro in full and states no price", () => {
		const { container } = render(<WeeklyGymPrivacyPage />)
		const text = container.textContent ?? ""

		expect(text).toContain("Weekly Gym Pro")
		expect(text.replaceAll("Weekly Gym Pro", "")).not.toMatch(/\bPro\b/)
		expect(text).not.toMatch(/[$€£]/)
	})
})
