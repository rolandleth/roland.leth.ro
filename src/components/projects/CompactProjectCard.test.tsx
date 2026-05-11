import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import CompactProjectCard from "./CompactProjectCard"
import type { ProjectGalleryItem } from "@/lib/projects"

vi.mock("next/image", () => ({
	default: (props: Record<string, unknown>) => {
		// eslint-disable-next-line @next/next/no-img-element
		return <img alt={props.alt as string} src={props.src as string} />
	},
}))

function makeProject(
	overrides: Partial<ProjectGalleryItem> = {}
): ProjectGalleryItem {
	return {
		id: 1,
		name: "Test Project",
		slug: "test",
		summary: "Summary",
		platform: "iOS",
		role: null,
		accentColor: null,
		isFeatured: false,
		isDiscontinued: false,
		sortOrder: 0,
		icon: "/icon.png",
		heroImage: null,
		...overrides,
	}
}

describe("CompactProjectCard — discontinued scoping (Phase 8 a11y)", () => {
	it("scopes the discontinued fade to the icon, not the name", () => {
		// Phase 8 fix: the prior version applied `opacity-50 grayscale` to the
		// whole card, dropping the already-muted `text-secondary` name below
		// WCAG AA against the background. The fade now applies to the icon
		// container only; the name stays at full opacity so contrast holds.
		render(
			<CompactProjectCard project={makeProject({ isDiscontinued: true })} />
		)

		// Icon container carries the fade…
		const icon = screen.getByAltText("Test Project icon")
		const fadeContainer = icon.closest(".grayscale")
		expect(fadeContainer).not.toBeNull()

		// …but the name span doesn't sit inside the faded subtree.
		const name = screen.getByText("Test Project")
		expect(name.closest(".grayscale")).toBeNull()
	})

	it("omits the fade entirely when isDiscontinued is false", () => {
		const { container } = render(
			<CompactProjectCard project={makeProject({ isDiscontinued: false })} />
		)
		expect(container.querySelector(".grayscale")).toBeNull()
		expect(container.querySelector(".opacity-60")).toBeNull()
	})
})
