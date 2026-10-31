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

	// The built-in muscle tags drive the per-muscle progress, and the app lets
	// the user change them on any exercise, so the terms say both.
	it("says the built-in muscles may contain errors and can be changed", () => {
		const { container } = render(<WeeklyGymTermsPage />)

		expect(container.textContent).toContain(
			"The muscles listed for each built-in exercise are general information. We try to keep them accurate, but we can't promise they're free of errors. You can change the muscles of any exercise in the app."
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

	// All three purchases are family-shareable, and a subscription is managed
	// from the Apple Account that bought it, which with purchase sharing may not
	// be the one that pays.
	it("covers Family Sharing, and who can manage a shared purchase", () => {
		const { container } = render(<WeeklyGymTermsPage />)
		const text = (container.textContent ?? "").replace(/\s+/g, " ")

		expect(text).toContain("With Family Sharing")
		expect(text).toContain(
			"Only the family member who bought it can manage or cancel it."
		)
	})

	// Yearly has a free trial, so "charged when you confirm" alone would be
	// false. The app's paywall (`PaywallPlans` in the Weekly Gym repo) states
	// the same sentence under its buy button.
	it("says when a free trial is charged, as the app's paywall does", () => {
		const { container } = render(<WeeklyGymTermsPage />)
		const text = (container.textContent ?? "").replace(/\s+/g, " ")

		expect(text).toContain(
			"Payment is charged to your Apple Account when you confirm the purchase or, after a free trial, when the trial ends."
		)
		expect(text).toContain(
			"Cancel at least 24 hours before a trial ends and nothing is charged."
		)
	})

	// The app has its own Manage subscription and Restore purchases rows in
	// Settings, so the terms point there as well as to the App Store.
	it("names the in-app Manage subscription and Restore purchases", () => {
		const { container } = render(<WeeklyGymTermsPage />)
		const text = (container.textContent ?? "").replace(/\s+/g, " ")

		expect(text).toContain(
			"from Manage subscription in Weekly Gym's Settings or in your App Store account settings"
		)
		expect(text).toContain("you keep Weekly Gym Pro until that period ends")
		expect(text).toContain(
			"Restore purchases, in Settings, asks the App Store again."
		)
	})

	// More plans with a rotation ship as Weekly Gym Pro's second point, so the
	// terms list them with what it adds, and say what the free app keeps.
	it("names more plans and the rotation in Weekly Gym Pro, and one plan free", () => {
		const { container } = render(<WeeklyGymTermsPage />)
		const text = (container.textContent ?? "").replace(/\s+/g, " ")

		expect(text).toContain("The free app has one plan")
		expect(text).toContain(
			"more than one plan, and a rotation in which your plans take turns, one per calendar week"
		)
	})

	// A lapse hides plans, never deletes them, and keeps the plan the user is on
	// (the Weekly Gym Pro brief's rule 9); renewing brings them back.
	it("says what happens to plans when Weekly Gym Pro ends, and on renewal", () => {
		const { container } = render(<WeeklyGymTermsPage />)
		const text = (container.textContent ?? "").replace(/\s+/g, " ")

		expect(text).toContain(
			"your older weeks and your plans stay saved and keep syncing"
		)
		expect(text).toContain(
			"the plan you're on stays the one your weeks follow, for as long as you want, and any rotation pauses"
		)
		expect(text).toContain(
			"going back to another plan after that needs Weekly Gym Pro"
		)
		expect(text).toContain(
			"a rotation goes on with the plan after the current one"
		)
	})

	// Weekly Gym Pro is named in full, and prices live in the app, never here:
	// they aren't decided, and the App Store shows them before a purchase.
	it("names Weekly Gym Pro in full and states no price", () => {
		const { container } = render(<WeeklyGymTermsPage />)
		const text = container.textContent ?? ""

		expect(text).toContain("Weekly Gym Pro")
		expect(text.replaceAll("Weekly Gym Pro", "")).not.toMatch(/\bPro\b/)
		expect(text).not.toMatch(/[$€£]/)
	})
})
