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

		expect(text).toContain(
			"while iCloud is on for Weekly Gym, in your own iCloud account"
		)
		expect(text).not.toMatch(/stays on your device/)
	})

	// Weekly Gym Pro keeps several plans and a rotation in the synced store, each
	// week records the plan it came from, and a deleted plan leaves a record
	// behind, so the page names all of it.
	it("says what it stores for plans and the rotation, and what deleting a plan keeps", () => {
		const { container } = render(<WeeklyGymPrivacyPage />)
		const text = (container.textContent ?? "").replace(/\s+/g, " ")

		expect(text).toContain("your plans, each with its name")
		expect(text).toContain(
			"your rotation of plans, with its order, whether it's on and the week it counts from"
		)
		expect(text).toContain("the day your weeks start on")
		expect(text).toContain(
			"a record of the plan stays, with its name and the date you deleted it"
		)
		expect(text).toContain("Past weeks keep their copy of the plan and its name.")
	})

	// The note that a renewal should carry the rotation on lives beside the
	// Weekly Gym Pro answer, in the app's own defaults, and never syncs.
	it("keeps the renewal note on the device, with the Weekly Gym Pro answer", () => {
		const { container } = render(<WeeklyGymPrivacyPage />)
		const text = (container.textContent ?? "").replace(/\s+/g, " ")

		expect(text).toContain(
			"the app also keeps a note of that on the device until you get Weekly Gym Pro again"
		)
		expect(text).toContain("Neither one syncs")
	})

	// A set logged from a widget or control syncs only once the app opens, and
	// Siri gets the reply text; both are data handed beyond the app itself.
	it("says when a widget's set syncs, and what Weekly Gym gives Siri", () => {
		const { container } = render(<WeeklyGymPrivacyPage />)
		const text = (container.textContent ?? "").replace(/\s+/g, " ")

		expect(text).toContain(
			"reaches your other devices once you next open Weekly Gym on that device"
		)
		expect(text).toContain("each with its main muscles")
		expect(text).toContain(
			"it gives Siri the reply to show and say: the exercise, which set it was and its values."
		)
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
