import { afterEach, describe, expect, it, vi } from "vitest"
import { ProjectProminence, ProjectStatus } from "@/generated/prisma/enums"
import {
	gallerySectionOf,
	gallerySections,
	isPlacementOverridden,
	isWideAppTile,
} from "./projectsGallery"

// #region gallerySections

describe("gallerySections", () => {
	const project = (
		name: string,
		prominence: ProjectProminence,
		status: ProjectStatus = ProjectStatus.live
	) => ({ name, prominence, status })

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("puts high projects in the tiles, medium ones in the cards and low ones under More projects", () => {
		const sections = gallerySections([
			project("Reckon", ProjectProminence.high),
			project("MyTherme", ProjectProminence.medium),
			project("Goalee", ProjectProminence.low),
		])

		expect(sections.high.map((p) => p.name)).toEqual(["Reckon"])
		expect(sections.medium.map((p) => p.name)).toEqual(["MyTherme"])
		expect(sections.more.map((p) => p.name)).toEqual(["Goalee"])
	})

	it("sends a discontinued project to More projects whatever its prominence", () => {
		const sections = gallerySections([
			project("Old app", ProjectProminence.high, ProjectStatus.discontinued),
			project(
				"Old client",
				ProjectProminence.medium,
				ProjectStatus.discontinued
			),
			project("Older", ProjectProminence.low, ProjectStatus.discontinued),
		])

		expect(sections.high).toEqual([])
		expect(sections.medium).toEqual([])
		expect(sections.more.map((p) => p.name)).toEqual([
			"Old app",
			"Old client",
			"Older",
		])
	})

	it("puts a coming-soon project where its prominence says, as a live one", () => {
		const sections = gallerySections([
			project("Digest", ProjectProminence.high, ProjectStatus.comingSoon),
			project("Client", ProjectProminence.medium, ProjectStatus.comingSoon),
			project("Tool", ProjectProminence.low, ProjectStatus.comingSoon),
		])

		expect(sections.high.map((p) => p.name)).toEqual(["Digest"])
		expect(sections.medium.map((p) => p.name)).toEqual(["Client"])
		expect(sections.more.map((p) => p.name)).toEqual(["Tool"])
	})

	it("keeps the order the projects came in, within each part", () => {
		const sections = gallerySections([
			project("Continuum", ProjectProminence.high),
			project("Old", ProjectProminence.low),
			project("Digest", ProjectProminence.high, ProjectStatus.comingSoon),
			project("Reckon", ProjectProminence.high),
			project("Gone", ProjectProminence.high, ProjectStatus.discontinued),
			project("Older", ProjectProminence.low),
		])

		expect(sections.high.map((p) => p.name)).toEqual([
			"Continuum",
			"Digest",
			"Reckon",
		])
		expect(sections.more.map((p) => p.name)).toEqual(["Old", "Gone", "Older"])
	})

	it("lists a project with an unknown prominence under More projects, and logs it", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {})
		const sections = gallerySections([
			{
				name: "Ahead",
				prominence: "xHigh" as ProjectProminence,
				status: ProjectStatus.live,
			},
		])

		expect(sections.more.map((p) => p.name)).toEqual(["Ahead"])
		expect(error).toHaveBeenCalledWith(
			"[projects:gallery] unknown prominence, listed under More projects",
			{ prominence: "xHigh" }
		)
	})

	it("places a project with an unknown status by its prominence, as only discontinued moves one", () => {
		const sections = gallerySections([
			project("Ahead", ProjectProminence.high, "paused" as ProjectStatus),
		])

		expect(sections.high.map((p) => p.name)).toEqual(["Ahead"])
	})

	it("returns three empty parts for no projects", () => {
		expect(gallerySections([])).toEqual({ high: [], medium: [], more: [] })
	})
})

// #endregion

// #region isPlacementOverridden

describe("isPlacementOverridden", () => {
	it.each([ProjectProminence.high, ProjectProminence.medium])(
		"is true for a discontinued project at %s, which lands under More projects instead",
		(prominence) => {
			const project = { prominence, status: ProjectStatus.discontinued }

			expect(isPlacementOverridden(project)).toBe(true)
			expect(gallerySectionOf(project)).toBe("more")
		}
	)

	it("is false for a discontinued project at low, which lands there anyway", () => {
		expect(
			isPlacementOverridden({
				prominence: ProjectProminence.low,
				status: ProjectStatus.discontinued,
			})
		).toBe(false)
	})

	it.each(
		Object.values(ProjectProminence).flatMap((prominence) => [
			[prominence, ProjectStatus.live],
			[prominence, ProjectStatus.comingSoon],
		])
	)(
		"is false for a project at %s that is %s, which lands where its level says",
		(prominence, status) => {
			expect(isPlacementOverridden({ prominence, status })).toBe(false)
		}
	)
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
