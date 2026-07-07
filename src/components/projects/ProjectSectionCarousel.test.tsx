import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import ProjectSectionCarousel from "./ProjectSectionCarousel"
import type { GalleryImage } from "@/lib/client/gallery"

const user = setupUser()

vi.mock("next/image", () => ({
	default: (props: Record<string, unknown>) => {
		// eslint-disable-next-line @next/next/no-img-element
		return <img alt={props.alt as string} src={props.src as string} />
	},
}))

// One section's worth of the flat gallery (all `sectionIndex: 0`).
const images: GalleryImage[] = [
	{
		id: 1,
		url: "/a.jpg",
		caption: "First slide",
		sectionIndex: 0,
		localIndex: 0,
		sectionTitle: "MyApp",
	},
	{
		id: 2,
		url: "/b.jpg",
		caption: "Second slide",
		sectionIndex: 0,
		localIndex: 1,
		sectionTitle: "MyApp",
	},
	{
		id: 3,
		url: "/c.jpg",
		caption: null,
		sectionIndex: 0,
		localIndex: 2,
		sectionTitle: "MyApp",
	},
]

function renderCarousel(
	overrides: Partial<React.ComponentProps<typeof ProjectSectionCarousel>> = {}
) {
	const props = {
		images,
		index: 0,
		canNavigate: true,
		galleryLabel: "MyApp",
		onSelectImage: vi.fn(),
		onEnlarge: vi.fn(),
		...overrides,
	}

	return { ...render(<ProjectSectionCarousel {...props} />), props }
}

describe("ProjectSectionCarousel", () => {
	it("announces the slide region with carousel semantics and aria-live", () => {
		renderCarousel()
		const group = screen.getByRole("group", { name: /MyApp screenshots/i })
		expect(group).toHaveAttribute("aria-roledescription", "carousel")

		// The slide region is the aria-live container; SR users hear the new
		// caption when the slide changes.
		const liveRegion = group.querySelector('[aria-live="polite"]')
		expect(liveRegion).not.toBeNull()
	})

	it("has no in-page navigation arrows (those live in the fullscreen view)", () => {
		renderCarousel()
		expect(
			screen.queryByRole("button", { name: /next image/i })
		).not.toBeInTheDocument()
		expect(
			screen.queryByRole("button", { name: /previous image/i })
		).not.toBeInTheDocument()
	})

	it("renders a dot button per section image with the current one aria-current", () => {
		renderCarousel({ index: 1 })
		const dots = screen.getAllByRole("button", { name: /go to image/i })
		expect(dots).toHaveLength(3)
		expect(dots[1]).toHaveAttribute("aria-current", "true")
		expect(dots[0]).not.toHaveAttribute("aria-current")
	})

	it("uses padding to extend dot hit regions instead of overlapping pseudo-elements", () => {
		// A prior version used `before:-m-2.5` (10px outset) with `gap-1.5` (6px),
		// so adjacent click regions overlapped by ~14px and mis-routed clicks in
		// the visible gap. The padded wrapper button replaced it.
		renderCarousel()
		const firstDot = screen.getAllByRole("button", { name: /go to image/i })[0]
		expect(firstDot.className).toContain("p-2.5")
		expect(firstDot.className).not.toContain("before:-m-2.5")
	})

	it("reports the clicked dot's flat index to the parent", async () => {
		const { props } = renderCarousel()
		const dots = screen.getAllByRole("button", { name: /go to image/i })
		await user.click(dots[2])
		expect(props.onSelectImage).toHaveBeenCalledWith(2)
	})

	it("maps a dot to the right flat index when the section starts mid-gallery", async () => {
		// A two-section gallery viewed at its second section: the dots are scoped to
		// that section, but each must resolve to its *flat* index (offset past the
		// first section) so the parent moves the continuous strip correctly.
		const twoSections: GalleryImage[] = [
			{
				id: 1,
				url: "/a.jpg",
				caption: "Alpha one",
				sectionIndex: 0,
				localIndex: 0,
				sectionTitle: "Alpha",
			},
			{
				id: 2,
				url: "/b.jpg",
				caption: "Beta one",
				sectionIndex: 1,
				localIndex: 0,
				sectionTitle: "Beta",
			},
			{
				id: 3,
				url: "/c.jpg",
				caption: "Beta two",
				sectionIndex: 1,
				localIndex: 1,
				sectionTitle: "Beta",
			},
		]
		const { props } = renderCarousel({ images: twoSections, index: 1 })
		const dots = screen.getAllByRole("button", { name: /go to image/i })
		expect(dots).toHaveLength(2)

		await user.click(dots[1])
		expect(props.onSelectImage).toHaveBeenCalledWith(2)
	})

	it("enlarges the current image on click", async () => {
		const { props } = renderCarousel()
		await user.click(
			screen.getByRole("button", { name: /enlarge first slide/i })
		)
		expect(props.onEnlarge).toHaveBeenCalledOnce()
	})

	it("renders nothing when the gallery is empty (defensive guard)", () => {
		// Callers gate on the active section having images; enforcing the contract
		// locally means the index math can never throw if a caller forgets it.
		const { container } = renderCarousel({ images: [] })
		expect(container.firstChild).toBeNull()
	})

	it("does not render dots for a single-image section", () => {
		renderCarousel({
			images: [
				{
					id: 1,
					url: "/only.jpg",
					caption: "Only one",
					sectionIndex: 0,
					localIndex: 0,
					sectionTitle: "MyApp",
				},
			],
		})
		expect(
			screen.queryByRole("button", { name: /go to image/i })
		).not.toBeInTheDocument()
	})
})
