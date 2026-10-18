import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import ProjectAccentStyle from "./ProjectAccentStyle"

describe("ProjectAccentStyle", () => {
	it("tints the header with the project's accent in the first paint", () => {
		const { container } = render(<ProjectAccentStyle accentColor="#405A55" />)

		expect(container.querySelector("style")?.textContent).toBe(
			":root { --color-header-accent: #405A55; }"
		)
	})

	it("renders nothing without an accent, so the site's default stays", () => {
		const { container } = render(<ProjectAccentStyle accentColor={null} />)

		expect(container).toBeEmptyDOMElement()
	})
})
