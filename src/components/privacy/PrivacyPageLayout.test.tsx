import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import PrivacyPageLayout from "./PrivacyPageLayout"

describe("PrivacyPageLayout — landmark structure", () => {
	it("does not render its own <main> (root layout owns the single <main>)", () => {
		const { container } = render(
			<PrivacyPageLayout
				title="Privacy Policy"
				sections={[
					{ title: "Section A", content: <p>body A</p> },
					{ title: "Section B", content: <p>body B</p> },
				]}
				lastUpdated="Apr 7, 2026"
				contactEmail="roland+hi@leth.ro"
			/>
		)

		// `src/app/layout.tsx` owns the document `<main>`. Per-page wrappers
		// must NOT introduce a second landmark — `/privacy` and the per-app
		// pages all render through this component, so a `<main>` here would
		// produce two `<main>` per document.
		expect(container.querySelector("main")).toBeNull()
	})

	it("renders the title and every page-supplied section", () => {
		const { getByRole, getByText } = render(
			<PrivacyPageLayout
				title="Privacy Policy"
				sections={[
					{ title: "Data we collect", content: <p>nothing</p> },
					{ title: "Sharing", content: <p>nobody</p> },
				]}
				lastUpdated="Apr 7, 2026"
				contactEmail="roland+hi@leth.ro"
			/>
		)
		expect(getByRole("heading", { level: 1 })).toHaveTextContent(
			"Privacy Policy"
		)
		expect(getByText("Data we collect")).toBeInTheDocument()
		expect(getByText("Sharing")).toBeInTheDocument()
	})
})

describe("PrivacyPageLayout — auto-rendered boilerplate sections", () => {
	it("renders the last-updated date from props", () => {
		const { getByText } = render(
			<PrivacyPageLayout
				title="Privacy Policy"
				sections={[]}
				lastUpdated="May 30, 2026"
				contactEmail="roland+reckon@leth.ro"
			/>
		)
		// Date is interpolated mid-sentence, so match on a substring node.
		expect(getByText(/last updated on May 30, 2026/)).toBeInTheDocument()
	})

	it("renders the contact section with a mailto: link from props", () => {
		const { getByRole } = render(
			<PrivacyPageLayout
				title="Privacy Policy"
				sections={[]}
				lastUpdated="May 30, 2026"
				contactEmail="roland+reckon@leth.ro"
			/>
		)
		const link = getByRole("link", { name: "contact us" })
		expect(link).toHaveAttribute("href", "mailto:roland+reckon@leth.ro")
	})

	it("defaults the contact pronoun to 'us' (per-app voice)", () => {
		const { getByRole } = render(
			<PrivacyPageLayout
				title="Reckon – Privacy Policy"
				sections={[]}
				lastUpdated="May 30, 2026"
				contactEmail="roland+reckon@leth.ro"
			/>
		)
		expect(getByRole("link", { name: "contact us" })).toBeInTheDocument()
	})

	it("uses 'me' when the root personal page overrides the pronoun", () => {
		const { getByRole } = render(
			<PrivacyPageLayout
				title="Privacy Policy"
				sections={[]}
				lastUpdated="Apr 7, 2026"
				contactEmail="roland+hi@leth.ro"
				contactPronoun="me"
			/>
		)
		const link = getByRole("link", { name: "contact me" })
		expect(link).toHaveAttribute("href", "mailto:roland+hi@leth.ro")
	})
})
