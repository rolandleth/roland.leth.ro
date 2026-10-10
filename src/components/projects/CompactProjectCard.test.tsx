import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
	PlatformBucket,
	PlatformTag,
	ProjectStatus,
} from "@/generated/prisma/enums"
import { makeProjectGalleryItem } from "@/test/fixtures"
import CompactProjectCard from "./CompactProjectCard"
import type { ProjectGalleryItem } from "@/lib/db/projects"

vi.mock("next/image", () => ({
	default: (props: Record<string, unknown>) => {
		// eslint-disable-next-line @next/next/no-img-element
		return <img alt={props.alt as string} src={props.src as string} />
	},
}))

function makeProject(
	overrides: Partial<ProjectGalleryItem> = {}
): ProjectGalleryItem {
	return makeProjectGalleryItem({
		id: 1,
		name: "Test Project",
		slug: "test",
		summary: "Summary",
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
		icon: "/icon.png",
		...overrides,
	})
}

describe("CompactProjectCard — discontinued scoping (Phase 8 a11y)", () => {
	it("scopes the discontinued fade to the icon, not the name", () => {
		// Phase 8 fix: the prior version applied `opacity-50 grayscale` to the
		// whole card, dropping the already-muted `text-secondary` name below
		// WCAG AA against the background. The fade now applies to the icon
		// container only; the name stays at full opacity so contrast holds.
		render(
			<CompactProjectCard
				project={makeProject({ status: ProjectStatus.discontinued })}
			/>
		)

		// Icon container carries the fade…
		const icon = screen.getByAltText("Test Project icon")
		const fadeContainer = icon.closest(".grayscale")
		expect(fadeContainer).not.toBeNull()

		// …but the name span doesn't sit inside the faded subtree.
		const name = screen.getByText("Test Project")
		expect(name.closest(".grayscale")).toBeNull()
	})

	it.each([ProjectStatus.live, ProjectStatus.comingSoon])(
		"omits the fade entirely for a %s project",
		(status) => {
			const { container } = render(
				<CompactProjectCard project={makeProject({ status })} />
			)
			expect(container.querySelector(".grayscale")).toBeNull()
			expect(container.querySelector(".opacity-60")).toBeNull()
		}
	)
})

describe("CompactProjectCard — status line", () => {
	it("says a coming-soon project is coming soon, inside its link", () => {
		render(
			<CompactProjectCard
				project={makeProject({ status: ProjectStatus.comingSoon })}
			/>
		)

		expect(screen.getByRole("link")).toHaveTextContent("Coming soon")
	})

	it.each([ProjectStatus.live, ProjectStatus.discontinued])(
		"has no status line for a %s project",
		(status) => {
			render(<CompactProjectCard project={makeProject({ status })} />)

			expect(screen.queryByText("Coming soon")).not.toBeInTheDocument()
			expect(screen.queryByText("Discontinued")).not.toBeInTheDocument()
		}
	)
})
