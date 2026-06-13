import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import LegalPageLayout from "./LegalPageLayout"

describe("LegalPageLayout — landmark structure", () => {
	it("does not render its own <main> (root layout owns the single <main>)", () => {
		const { container } = render(
			<LegalPageLayout
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
			<LegalPageLayout
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

describe("LegalPageLayout — auto-rendered boilerplate sections", () => {
	it("renders the last-updated date from props", () => {
		const { getByText } = render(
			<LegalPageLayout
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
			<LegalPageLayout
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
			<LegalPageLayout
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
			<LegalPageLayout
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

	it("defaults to privacy-policy boilerplate wording", () => {
		const { getByText } = render(
			<LegalPageLayout
				title="Continuum – Privacy Policy"
				sections={[]}
				lastUpdated="June 10, 2026"
				contactEmail="roland+continuum@leth.ro"
			/>
		)
		// Singular self-reference and the "questions or concerns" intro are the
		// privacy default; terms must not leak into a page that didn't opt in.
		expect(
			getByText(/This privacy policy was last updated/)
		).toBeInTheDocument()
		expect(
			getByText(/If you have any questions or concerns/)
		).toBeInTheDocument()
	})

	it("renders terms-appropriate boilerplate when documentKind is 'terms'", () => {
		const { getByText, queryByText } = render(
			<LegalPageLayout
				title="Continuum – Terms of Use"
				sections={[]}
				lastUpdated="June 10, 2026"
				contactEmail="roland+continuum@leth.ro"
				documentKind="terms"
			/>
		)
		// Terms refer to themselves in the plural and carry their own contact
		// intro — the whole point of generalizing the layout off "privacy".
		expect(getByText(/These terms were last updated/)).toBeInTheDocument()
		expect(
			getByText(/If you have any questions about these terms/)
		).toBeInTheDocument()
		expect(queryByText(/This privacy policy was/)).toBeNull()
	})
})

describe("LegalPageLayout — related links", () => {
	it("renders a Related section linking each sibling page", () => {
		const { getByRole, getByText } = render(
			<LegalPageLayout
				title="Continuum – Privacy Policy"
				sections={[]}
				lastUpdated="June 10, 2026"
				contactEmail="roland+continuum@leth.ro"
				relatedLinks={[
					{ label: "Terms of use", href: "/terms/continuum" },
					{ label: "DPIA template", href: "/privacy/continuum/dpia" },
				]}
			/>
		)
		expect(getByText("Related")).toBeInTheDocument()
		expect(getByRole("link", { name: "Terms of use" })).toHaveAttribute(
			"href",
			"/terms/continuum"
		)
		expect(getByRole("link", { name: "DPIA template" })).toHaveAttribute(
			"href",
			"/privacy/continuum/dpia"
		)
	})

	it("omits the Related section when no links are given", () => {
		const { queryByText } = render(
			<LegalPageLayout
				title="Reckon – Privacy Policy"
				sections={[]}
				lastUpdated="May 30, 2026"
				contactEmail="roland+reckon@leth.ro"
			/>
		)
		// Standalone pages (no cluster) must not sprout an empty Related heading.
		expect(queryByText("Related")).toBeNull()
	})
})
