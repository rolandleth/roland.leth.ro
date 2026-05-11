import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import ProjectSectionCarousel from "./ProjectSectionCarousel"

vi.mock("next/image", () => ({
	default: (props: Record<string, unknown>) => {
		// eslint-disable-next-line @next/next/no-img-element
		return <img alt={props.alt as string} src={props.src as string} />
	},
}))

const images = [
	{ id: 1, url: "/a.jpg", caption: "First slide" },
	{ id: 2, url: "/b.jpg", caption: "Second slide" },
	{ id: 3, url: "/c.jpg", caption: null },
]

describe("ProjectSectionCarousel — a11y (Phase 8)", () => {
	it("announces the slide region with carousel semantics and aria-live", () => {
		render(<ProjectSectionCarousel images={images} altPrefix="MyApp" />)
		const group = screen.getByRole("group", {
			name: /MyApp screenshots/i,
		})
		expect(group).toHaveAttribute("aria-roledescription", "carousel")

		// The slide region is the aria-live container; SR users hear the new
		// caption when the slide changes.
		const liveRegion = group.querySelector('[aria-live="polite"]')
		expect(liveRegion).not.toBeNull()
	})

	it("reveals the arrow buttons on keyboard focus (not just hover)", () => {
		render(<ProjectSectionCarousel images={images} altPrefix="MyApp" />)
		const prev = screen.getByRole("button", { name: /previous image/i })
		const next = screen.getByRole("button", { name: /next image/i })

		// Class assertion is the regression guard: Phase 8 added
		// `focus-visible:opacity-100`. Without it, Tab landed on a transparent
		// control with no visual feedback.
		expect(prev.className).toContain("focus-visible:opacity-100")
		expect(next.className).toContain("focus-visible:opacity-100")
	})

	it("renders a dot button per image with the active one marked aria-current", () => {
		render(<ProjectSectionCarousel images={images} altPrefix="MyApp" />)
		const dots = screen.getAllByRole("button", { name: /go to image/i })
		expect(dots).toHaveLength(3)
		expect(dots[0]).toHaveAttribute("aria-current", "true")
	})

	it("uses padding to extend dot hit regions instead of overlapping pseudo-elements", () => {
		// Phase 8 originally used `before:-m-2.5` (10px outset) on each dot with
		// `gap-1.5` (6px) between them, so adjacent click regions overlapped by
		// ~14px and mis-routed clicks in the visible gap. The fix replaces the
		// pseudo with a padded wrapper button — assertion pins the new shape so
		// a regression to the pseudo trick surfaces.
		render(<ProjectSectionCarousel images={images} altPrefix="MyApp" />)
		const firstDot = screen.getAllByRole("button", { name: /go to image/i })[0]
		expect(firstDot.className).toContain("p-2.5")
		expect(firstDot.className).not.toContain("before:-m-2.5")
	})

	it("paginates to the next image when Next is clicked and exposes the new aria-current", async () => {
		render(<ProjectSectionCarousel images={images} altPrefix="MyApp" />)
		await userEvent.click(screen.getByRole("button", { name: /next image/i }))

		const dots = screen.getAllByRole("button", { name: /go to image/i })
		expect(dots[1]).toHaveAttribute("aria-current", "true")
		expect(dots[0]).not.toHaveAttribute("aria-current")
	})
})
