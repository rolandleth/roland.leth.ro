import { describe, expect, it } from "vitest"
import { gallerySections, isWideAppTile } from "./projectsGallery"

// #region gallerySections

describe("gallerySections", () => {
	const project = (name: string, isFeatured: boolean, isOwnApp: boolean) => ({
		name,
		isFeatured,
		isOwnApp,
	})

	it("puts featured own apps under My apps, other featured projects under Work, and the rest under Earlier", () => {
		const sections = gallerySections([
			project("Reckon", true, true),
			project("MyTherme", true, false),
			project("Body Tracking", false, true),
			project("DeinDeal", false, false),
		])

		expect(sections.apps.map((p) => p.name)).toEqual(["Reckon"])
		expect(sections.work.map((p) => p.name)).toEqual(["MyTherme"])
		// An own app that isn't featured is an earlier project, like any other.
		expect(sections.earlier.map((p) => p.name)).toEqual([
			"Body Tracking",
			"DeinDeal",
		])
	})

	it("keeps the order the projects came in, within each section", () => {
		const sections = gallerySections([
			project("Continuum", true, true),
			project("Old", false, false),
			project("Reckon", true, true),
			project("Older", false, false),
		])

		expect(sections.apps.map((p) => p.name)).toEqual(["Continuum", "Reckon"])
		expect(sections.earlier.map((p) => p.name)).toEqual(["Old", "Older"])
	})

	it("returns three empty sections for no projects", () => {
		expect(gallerySections([])).toEqual({ apps: [], work: [], earlier: [] })
	})
})

// #endregion

// #region isWideAppTile

describe("isWideAppTile", () => {
	const layout = (count: number) =>
		Array.from({ length: count }, (_, index) => isWideAppTile(index, count))

	it("makes a lone app one wide tile", () => {
		expect(layout(1)).toEqual([true])
	})

	it("pairs an even count into halves, none wide", () => {
		expect(layout(2)).toEqual([false, false])
		expect(layout(4)).toEqual([false, false, false, false])
	})

	it("widens only the first of an odd count, so the rest pair up", () => {
		expect(layout(3)).toEqual([true, false, false])
		expect(layout(5)).toEqual([true, false, false, false, false])
	})
})

// #endregion
