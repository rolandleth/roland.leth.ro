import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { setupUser } from "@/test/user"
import ProjectContent from "./ProjectContent"
import type { ProjectDetail } from "@/lib/db/projects"

const user = setupUser()

type ProjectSection = ProjectDetail["sections"][number]

function makeSection(
	id: number,
	title: string,
	overrides: Partial<ProjectSection> = {}
): ProjectSection {
	return {
		id,
		projectId: 1,
		title,
		description: `Description for ${title}`,
		sortOrder: id - 1,
		images: [],
		...overrides,
	}
}

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

describe("ProjectContent — tablist keyboard nav (Phase 8 a11y)", () => {
	function renderTabs() {
		const sections = [
			makeSection(1, "Overview"),
			makeSection(2, "Features"),
			makeSection(3, "Tech"),
		]

		return render(
			<ProjectContent
				project={makeProject({ sections })}
				renderedDescriptions={sections.map((s) => (
					<p key={s.id}>{s.description}</p>
				))}
			/>
		)
	}

	it("starts with the first tab selected and the rest tabIndex=-1 (roving)", () => {
		renderTabs()
		const tabs = screen.getAllByRole("tab")
		expect(tabs).toHaveLength(3)
		expect(tabs[0]).toHaveAttribute("aria-selected", "true")
		expect(tabs[0]).toHaveAttribute("tabindex", "0")
		expect(tabs[1]).toHaveAttribute("tabindex", "-1")
		expect(tabs[2]).toHaveAttribute("tabindex", "-1")
	})

	it("ArrowRight moves selection + focus to the next tab", async () => {
		renderTabs()
		const tabs = screen.getAllByRole("tab")
		tabs[0].focus()
		await user.keyboard("{ArrowRight}")
		expect(tabs[1]).toHaveAttribute("aria-selected", "true")
		expect(tabs[1]).toHaveAttribute("tabindex", "0")
	})

	it("ArrowLeft wraps from the first tab to the last", async () => {
		renderTabs()
		const tabs = screen.getAllByRole("tab")
		tabs[0].focus()
		await user.keyboard("{ArrowLeft}")
		expect(tabs[2]).toHaveAttribute("aria-selected", "true")
	})

	it("ArrowRight wraps from the last tab to the first", async () => {
		renderTabs()
		const tabs = screen.getAllByRole("tab")
		tabs[2].focus()
		// Click first to make ArrowRight target the third tab, then it should wrap.
		await user.click(tabs[2])
		await user.keyboard("{ArrowRight}")
		expect(tabs[0]).toHaveAttribute("aria-selected", "true")
	})

	it("Home jumps to the first tab, End jumps to the last", async () => {
		renderTabs()
		const tabs = screen.getAllByRole("tab")
		await user.click(tabs[1])

		await user.keyboard("{End}")
		expect(tabs[2]).toHaveAttribute("aria-selected", "true")

		await user.keyboard("{Home}")
		expect(tabs[0]).toHaveAttribute("aria-selected", "true")
	})
})

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
