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
			/>
		)

		// `src/app/layout.tsx` owns the document `<main>`. Per-page wrappers
		// must NOT introduce a second landmark — `/privacy` and
		// `/privacy/body-tracking` both render through this component, so a
		// `<main>` here would produce two `<main>` per document.
		expect(container.querySelector("main")).toBeNull()
	})

	it("renders the title and every section", () => {
		const { getByRole, getByText } = render(
			<PrivacyPageLayout
				title="Privacy Policy"
				sections={[
					{ title: "Data we collect", content: <p>nothing</p> },
					{ title: "Contact", content: <p>email</p> },
				]}
			/>
		)
		expect(getByRole("heading", { level: 1 })).toHaveTextContent(
			"Privacy Policy"
		)
		expect(getByText("Data we collect")).toBeInTheDocument()
		expect(getByText("Contact")).toBeInTheDocument()
	})
})
