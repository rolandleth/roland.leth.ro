import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import JsonLdScript from "./JsonLdScript"

// #region JsonLdScript

describe("JsonLdScript", () => {
	it("renders an application/ld+json script with the serialized data", () => {
		const { container } = render(
			<JsonLdScript data={{ "@type": "Thing", name: "Roland" }} />
		)
		const script = container.querySelector('script[type="application/ld+json"]')

		expect(script).not.toBeNull()
		expect(JSON.parse(script!.innerHTML)).toEqual({
			"@type": "Thing",
			name: "Roland",
		})
	})

	it("escapes values so they can't break out of the script tag", () => {
		const { container } = render(
			<JsonLdScript data={{ name: "</script><img src=x onerror=alert(1)>" }} />
		)
		const html = container.querySelector("script")!.innerHTML

		expect(html).not.toContain("<")
		expect(html).not.toContain(">")
		expect(html).toContain("\\u003c/script\\u003e")
	})

	it("renders nothing when data is null (an opted-out block)", () => {
		const { container } = render(<JsonLdScript data={null} />)

		expect(container.querySelector("script")).toBeNull()
	})

	it("throws on undefined instead of silently swallowing a builder bug", () => {
		// `undefined` is outside the `Record | null` contract: a builder that means
		// "no block" returns null. An `undefined` here signals a bug, so it must
		// surface (via `safeJsonLdString`) rather than render nothing. The cast
		// simulates an untyped caller, since the prop type now forbids `undefined`.
		expect(() =>
			render(<JsonLdScript data={undefined as unknown as null} />)
		).toThrow()
	})
})

// #endregion
