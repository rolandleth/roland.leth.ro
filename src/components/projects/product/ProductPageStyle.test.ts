import { describe, expect, it } from "vitest"
import { projectPaletteSchema } from "@/lib/api/schemas"
import { bandDeclarations } from "./ProductPageStyle"
import type { ProjectPaletteTheme } from "@/lib/db/projects"

const theme: ProjectPaletteTheme = {
	band: "#0e4f34",
	bandInk: "#fffcf7",
	bandInk2: "#dcefe4",
	bandHighlight: "#a9d9c1",
	accentText: "#187e55",
}

describe("the highlighted price's colour", () => {
	it("uses the theme's own colour when it has one", () => {
		expect(bandDeclarations({ ...theme, priceHighlight: "#0e4f34" })).toContain(
			"--product-price-highlight:#0e4f34"
		)
	})

	// The dark rule sits on the same element as the light one, so a theme that
	// declared nothing would keep the other theme's colour: a dark green set for
	// a white tile would land on a dark one.
	it("declares the band highlight when the theme has no colour of its own", () => {
		expect(bandDeclarations(theme)).toContain(
			"--product-price-highlight:#a9d9c1"
		)
	})

	it("is optional in a stored palette", () => {
		const palette = projectPaletteSchema.parse({ light: theme, dark: theme })

		expect(palette.light.priceHighlight).toBeUndefined()
	})

	// The palette is written into a `<style>` block, so only a hex may pass.
	it("takes only a hex colour", () => {
		const result = projectPaletteSchema.safeParse({
			light: { ...theme, priceHighlight: "red;}body{display:none" },
			dark: theme,
		})

		expect(result.success).toBe(false)
	})
})
