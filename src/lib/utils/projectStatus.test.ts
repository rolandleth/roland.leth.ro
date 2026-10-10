import { afterEach, describe, expect, it, vi } from "vitest"
import { ProjectStatus } from "@/generated/prisma/enums"
import { discontinuedLast, isDiscontinued, statusLabel } from "./projectStatus"

// #region isDiscontinued

describe("isDiscontinued", () => {
	it("is true only for a discontinued project", () => {
		expect(isDiscontinued({ status: ProjectStatus.discontinued })).toBe(true)
		expect(isDiscontinued({ status: ProjectStatus.live })).toBe(false)
		expect(isDiscontinued({ status: ProjectStatus.comingSoon })).toBe(false)
	})
})

// #endregion

// #region statusLabel

describe("statusLabel", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("names a coming-soon and a discontinued project", () => {
		expect(statusLabel(ProjectStatus.comingSoon)).toBe("Coming soon")
		expect(statusLabel(ProjectStatus.discontinued)).toBe("Discontinued")
	})

	it("gives a live project no label", () => {
		expect(statusLabel(ProjectStatus.live)).toBeNull()
	})

	it("gives an unknown status no label, and logs it", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {})

		expect(statusLabel("paused" as ProjectStatus)).toBeNull()
		expect(error).toHaveBeenCalledWith(
			"[projects:status] unknown status, shown without a label",
			{ status: "paused" }
		)
	})
})

// #endregion

// #region discontinuedLast

describe("discontinuedLast", () => {
	const project = (name: string, status: ProjectStatus) => ({ name, status })

	it("moves discontinued projects to the end, each kind in the order it came in", () => {
		const sorted = discontinuedLast([
			project("Gone", ProjectStatus.discontinued),
			project("Reckon", ProjectStatus.live),
			project("Older", ProjectStatus.discontinued),
			project("Continuum", ProjectStatus.live),
		])

		expect(sorted.map((p) => p.name)).toEqual([
			"Reckon",
			"Continuum",
			"Gone",
			"Older",
		])
	})

	it("leaves a coming-soon project where it was among the live ones", () => {
		const sorted = discontinuedLast([
			project("Digest", ProjectStatus.comingSoon),
			project("Gone", ProjectStatus.discontinued),
			project("Reckon", ProjectStatus.live),
			project("Tool", ProjectStatus.comingSoon),
		])

		expect(sorted.map((p) => p.name)).toEqual([
			"Digest",
			"Reckon",
			"Tool",
			"Gone",
		])
	})

	it("returns a new array and leaves the input as it was", () => {
		const input = [
			project("Gone", ProjectStatus.discontinued),
			project("Reckon", ProjectStatus.live),
		]

		const sorted = discontinuedLast(input)

		expect(sorted).not.toBe(input)
		expect(input.map((p) => p.name)).toEqual(["Gone", "Reckon"])
	})
})

// #endregion
