import { describe, expect, it } from "vitest"
import { relatedContinuumLegalLinks } from "@/components/privacy/continuumLegalLinks"
import { relatedLegalLinks } from "@/components/privacy/relatedLegalLinks"
import { relatedWeeklyGymLegalLinks } from "@/components/privacy/weeklyGymLegalLinks"

describe("relatedLegalLinks", () => {
	const links = [
		{ label: "Privacy policy", href: "/privacy/app" },
		{ label: "Terms of use", href: "/terms/app" },
	]

	it("leaves out the current page and keeps the others, in order", () => {
		expect(relatedLegalLinks(links, "/privacy/app")).toEqual([
			{ label: "Terms of use", href: "/terms/app" },
		])
	})

	it("keeps every link when the current page isn't in the set", () => {
		expect(relatedLegalLinks(links, "/privacy/other")).toEqual(links)
	})

	it("links each Weekly Gym page to the other one only", () => {
		expect(relatedWeeklyGymLegalLinks("/privacy/weekly-gym")).toEqual([
			{ label: "Terms of use", href: "/terms/weekly-gym" },
		])
		expect(relatedWeeklyGymLegalLinks("/terms/weekly-gym")).toEqual([
			{ label: "Privacy policy", href: "/privacy/weekly-gym" },
		])
	})

	it("links each Continuum page to the three others", () => {
		const related = relatedContinuumLegalLinks("/terms/continuum")

		expect(related).toHaveLength(3)
		expect(related.map((link) => link.href)).not.toContain("/terms/continuum")
	})
})
