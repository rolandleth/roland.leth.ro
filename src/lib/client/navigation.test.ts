import { describe, expect, it } from "vitest"
import { navLinks } from "@/lib/client/navigation"

describe("navLinks", () => {
	it("contains entries with non-empty labels and href starting with '/'", () => {
		// Pins the shape without freezing the exact set — adding a section is a
		// structural change reviewers should notice in the test diff.
		for (const link of navLinks) {
			expect(link.label.length).toBeGreaterThan(0)
			expect(link.href.startsWith("/")).toBe(true)
		}
	})

	it("is declared `as const` so consumers see literal types", () => {
		// Trips a type-level regression: `as const` turns arrays into readonly
		// tuples and strings into literal types. If someone drops `as const`,
		// downstream `href` typing widens to plain `string` and this test's
		// `const` assignment would catch any runtime shape drift too.
		const href: "/blog/tech" | "/projects" | "/about" = navLinks[0].href
		expect(typeof href).toBe("string")
	})

	it("has unique href values", () => {
		const hrefs = navLinks.map((l) => l.href)
		expect(new Set(hrefs).size).toBe(hrefs.length)
	})
})
