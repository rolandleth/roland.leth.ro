import { render, screen, within } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { setupUser } from "@/test/user"
import ProjectContent from "./ProjectContent"
import type { ProjectDetail } from "@/lib/db/projects"

const user = setupUser()

vi.mock("next/image", () => ({
	default: (props: Record<string, unknown>) => {
		// eslint-disable-next-line @next/next/no-img-element
		return <img alt={props.alt as string} src={props.src as string} />
	},
}))

type ProjectSection = ProjectDetail["sections"][number]
type ProjectImage = ProjectSection["images"][number]

function makeImage(id: number, caption: string): ProjectImage {
	return { id, sectionId: 1, url: `/${id}.jpg`, caption, sortOrder: id }
}

// happy-dom doesn't implement scrollIntoView; the tablist effect calls it when
// the active tab changes.
beforeAll(() => {
	if (typeof HTMLElement.prototype.scrollIntoView !== "function") {
		HTMLElement.prototype.scrollIntoView = () => {}
	}
})

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
		metaTitle: null,
		keywords: [],
		offers: null,
		icon: null,
		cardImage: null,
		ogImage: null,
		heroImage: null,
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
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
		faqs: [],
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
				renderedFaqAnswers={[]}
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
				renderedFaqAnswers={[]}
			/>
		)

		const styleAttrs = Array.from(container.querySelectorAll("[style]"))
			.map((el) => el.getAttribute("style") ?? "")
			.join("\n")

		expect(styleAttrs).not.toMatch(/undefined/)
		expect(styleAttrs).not.toMatch(/\bnull\b/)
	})
})

describe("ProjectContent — cross-section gallery navigation", () => {
	// Section "Alpha" has two images, "Beta" one — enough to exercise both the
	// within-section step and the boundary crossing.
	function renderGallery() {
		const sections = [
			makeSection(1, "Alpha", {
				images: [makeImage(11, "Alpha one"), makeImage(12, "Alpha two")],
			}),
			makeSection(2, "Beta", { images: [makeImage(21, "Beta one")] }),
		]

		return render(
			<ProjectContent
				project={makeProject({ sections })}
				renderedDescriptions={sections.map((s) => (
					<p key={s.id}>{s.description}</p>
				))}
				renderedFaqAnswers={[]}
			/>
		)
	}

	// The on-page carousel has no arrows; the only chevrons live in the
	// fullscreen lightbox, which is where cross-section walking happens.
	it("has no arrows on the in-page carousel", () => {
		renderGallery()
		expect(
			screen.queryByRole("button", { name: /next image/i })
		).not.toBeInTheDocument()
	})

	it("steps through a section's images, then crosses into the next section", async () => {
		renderGallery()
		await user.click(screen.getByRole("button", { name: /enlarge alpha one/i }))
		const dialog = screen.getByRole("dialog")
		expect(within(dialog).getByAltText("Alpha one")).toBeInTheDocument()

		const next = within(dialog).getByRole("button", { name: /next image/i })
		await user.click(next)
		expect(within(dialog).getByAltText("Alpha two")).toBeInTheDocument()

		// Past the last image of Alpha, Next crosses into Beta and selects its tab.
		await user.click(next)
		expect(within(dialog).getByAltText("Beta one")).toBeInTheDocument()
		expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute(
			"aria-selected",
			"true"
		)
	})

	it("crosses backward to the previous section's last image", async () => {
		renderGallery()
		await user.click(screen.getByRole("tab", { name: "Beta" }))
		await user.click(screen.getByRole("button", { name: /enlarge beta one/i }))
		const dialog = screen.getByRole("dialog")

		// Prev from Beta's first image lands on Alpha's last image.
		await user.click(
			within(dialog).getByRole("button", { name: /previous image/i })
		)
		expect(within(dialog).getByAltText("Alpha two")).toBeInTheDocument()
		expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute(
			"aria-selected",
			"true"
		)
	})

	it("scrolls the newly active tab into view when the lightbox crosses sections", async () => {
		renderGallery()
		const betaTab = screen.getByRole("tab", { name: "Beta" })
		const scrollIntoView = vi.spyOn(betaTab, "scrollIntoView")

		await user.click(screen.getByRole("button", { name: /enlarge alpha one/i }))
		const dialog = screen.getByRole("dialog")
		const next = within(dialog).getByRole("button", { name: /next image/i })
		await user.click(next) // Alpha two
		await user.click(next) // crosses into Beta

		expect(scrollIntoView).toHaveBeenCalled()
	})
})

describe("ProjectContent — FAQ", () => {
	type ProjectFaqItem = ProjectDetail["faqs"][number]

	function makeFaq(id: number, question: string): ProjectFaqItem {
		return { id, projectId: 1, question, answer: `Answer ${id}`, sortOrder: id }
	}

	it("renders the FAQ section with each question when faqs are present", () => {
		const faqs = [makeFaq(1, "Is it free?"), makeFaq(2, "Does it sync?")]

		render(
			<ProjectContent
				project={makeProject({ faqs })}
				renderedDescriptions={[]}
				renderedFaqAnswers={faqs.map((f) => (
					<p key={f.id}>{f.answer}</p>
				))}
			/>
		)

		expect(
			screen.getByRole("heading", { name: "FAQ", level: 2 })
		).toBeInTheDocument()
		expect(
			screen.getByRole("button", { name: /is it free/i })
		).toBeInTheDocument()
		expect(
			screen.getByRole("button", { name: /does it sync/i })
		).toBeInTheDocument()
	})

	it("omits the FAQ section entirely when there are no faqs", () => {
		render(
			<ProjectContent
				project={makeProject({ faqs: [] })}
				renderedDescriptions={[]}
				renderedFaqAnswers={[]}
			/>
		)

		expect(
			screen.queryByRole("heading", { name: "FAQ" })
		).not.toBeInTheDocument()
	})
})
