import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import LandingBackground from "./LandingBackground"

describe("LandingBackground", () => {
	it("renders all blob divs with the data-blob-bg attribute", () => {
		const { container } = render(<LandingBackground />)
		// CSS `@media (prefers-reduced-motion: reduce)` targets [data-blob-bg] to
		// disable animations. If the attribute is absent, the a11y override silently
		// stops working without any other failing test.
		const blobs = container.querySelectorAll("[data-blob-bg]")
		expect(blobs.length).toBeGreaterThan(0)
	})
})
