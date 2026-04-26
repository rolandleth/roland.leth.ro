import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import ProjectContent from "./ProjectContent"
import type { ProjectDetail } from "@/lib/projects"

function makeProject(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
	return {
		id: 1,
		name: "Test Project",
		slug: "test",
		summary: "A test project.",
		icon: null,
		heroImage: null,
		platform: "iOS",
		role: null,
		accentColor: null,
		isFeatured: false,
		isDiscontinued: false,
		date: null,
		sortOrder: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
		sections: [],
		links: [],
		...overrides,
	}
}

describe("ProjectContent — null accentColor", () => {
	// Regression guard for the icon-fallback color-mix: a previous version
	// interpolated the raw nullable `accentColor` instead of the `accent`
	// fallback constant, producing `color-mix(in srgb, undefined 15%, ...)` —
	// invalid CSS that browsers silently drop.
	it("does not interpolate undefined/null into any style attribute when accentColor is missing and no icon is provided", () => {
		const { container } = render(
			<ProjectContent
				project={makeProject({ icon: null, accentColor: null })}
				renderedDescriptions={[]}
			/>
		)

		const styleAttrs = Array.from(container.querySelectorAll("[style]"))
			.map((el) => el.getAttribute("style") ?? "")
			.join("\n")

		expect(styleAttrs).not.toMatch(/undefined/)
		expect(styleAttrs).not.toMatch(/\bnull\b/)
	})
})
