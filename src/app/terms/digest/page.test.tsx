import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import DigestTermsPage from "./page"

describe("Digest terms page", () => {
	it("asks readers to contact us, at Digest's address", () => {
		render(<DigestTermsPage />)

		expect(screen.getByRole("link", { name: "contact us" })).toHaveAttribute(
			"href",
			"mailto:roland+digest@leth.ro"
		)
	})

	it("links to the privacy policy from Related", () => {
		render(<DigestTermsPage />)

		expect(
			screen.getByRole("link", { name: "Privacy policy" })
		).toHaveAttribute("href", "/privacy/digest")
	})

	// Promotional and legal copy define Digest's intended purpose, so the
	// terms carry the owner's disclaimer sentence word for word (Digest's
	// `product/copy/brief.md`), and claim nothing medical.
	it("says Digest is a journal, in the disclaimer's own words", () => {
		const { container } = render(<DigestTermsPage />)

		expect(
			screen.getByRole("heading", { level: 2, name: "What Digest is" })
		).toBeInTheDocument()
		expect(container.textContent).toMatch(
			/Digest is a journal, not a medical device, and nothing in it is medical\s+advice\. It doesn't diagnose or treat anything\./
		)
		expect(container.textContent).not.toMatch(/\bas is\b/i)
	})

	it("names Pro's two forms, and that lapsing deletes nothing", () => {
		const { container } = render(<DigestTermsPage />)

		expect(container.textContent).toMatch(/A subscription, monthly or yearly/)
		expect(container.textContent).toMatch(/A one-time purchase/)
		expect(container.textContent).toMatch(/never deletes anything you logged/)
	})

	it("says the one-time purchase doesn't cancel a subscription", () => {
		const { container } = render(<DigestTermsPage />)

		expect(container.textContent).toMatch(
			/Buying it doesn't\s+cancel a subscription you already have/
		)
	})

	// Apple charges a trial when it ends, not on confirm, so "charged when you
	// confirm" alone would be false for a trial.
	it("says when a free trial is charged", () => {
		const { container } = render(<DigestTermsPage />)
		const text = (container.textContent ?? "").replace(/\s+/g, " ")

		expect(text).toContain(
			"Payment is charged to your Apple Account when you confirm the purchase or, after a free trial, when the trial ends."
		)
		expect(text).toContain(
			"Cancel at least 24 hours before a trial ends and nothing is charged."
		)
	})
})
