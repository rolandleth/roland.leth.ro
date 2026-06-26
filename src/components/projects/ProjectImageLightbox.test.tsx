import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import ProjectImageLightbox from "./ProjectImageLightbox"

const user = setupUser()

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

function noop() {}

function renderLightbox(
	overrides: Partial<React.ComponentProps<typeof ProjectImageLightbox>> = {}
) {
	const props = {
		isOpen: true,
		images,
		index: 0,
		altPrefix: "MyApp",
		canNavigate: true,
		onClose: noop,
		onPrev: noop,
		onNext: noop,
		...overrides,
	}

	return render(<ProjectImageLightbox {...props} />)
}

describe("ProjectImageLightbox", () => {
	it("renders nothing while closed", () => {
		renderLightbox({ isOpen: false })
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
	})

	it("renders a modal dialog with the current image when open", () => {
		renderLightbox()
		const dialog = screen.getByRole("dialog")
		expect(dialog).toHaveAttribute("aria-modal", "true")
		expect(screen.getByAltText("First slide")).toBeInTheDocument()
	})

	it("falls back to an alt derived from altPrefix when the caption is null", () => {
		renderLightbox({ index: 2 })
		expect(screen.getByAltText("MyApp screenshot")).toBeInTheDocument()
	})

	it("calls onClose when the close button is clicked", async () => {
		const onClose = vi.fn()
		renderLightbox({ onClose })
		await user.click(
			screen.getByRole("button", { name: /close enlarged image/i })
		)
		expect(onClose).toHaveBeenCalledOnce()
	})

	it("calls onClose when the backdrop is clicked", async () => {
		const onClose = vi.fn()
		renderLightbox({ onClose })
		await user.click(screen.getByRole("dialog"))
		expect(onClose).toHaveBeenCalledOnce()
	})

	it("calls onClose on Escape", async () => {
		const onClose = vi.fn()
		renderLightbox({ onClose })
		await user.keyboard("{Escape}")
		expect(onClose).toHaveBeenCalledOnce()
	})

	it("paginates with the on-screen arrows and the arrow keys", async () => {
		const onPrev = vi.fn()
		const onNext = vi.fn()
		renderLightbox({ onPrev, onNext })

		await user.click(screen.getByRole("button", { name: /next image/i }))
		await user.click(screen.getByRole("button", { name: /previous image/i }))
		await user.keyboard("{ArrowRight}")
		await user.keyboard("{ArrowLeft}")

		expect(onNext).toHaveBeenCalledTimes(2)
		expect(onPrev).toHaveBeenCalledTimes(2)
	})

	it("hides navigation when the gallery has nowhere to go", () => {
		// A single-image section with no other image-bearing sections — the parent
		// reports `canNavigate: false`, so the lightbox is a pure zoom view.
		renderLightbox({ images: [images[0]], canNavigate: false })
		expect(
			screen.queryByRole("button", { name: /next image/i })
		).not.toBeInTheDocument()
		expect(
			screen.queryByRole("button", { name: /previous image/i })
		).not.toBeInTheDocument()
	})

	it("keeps navigation for a single-image section when other sections exist", () => {
		// Cross-section walking means one image here still needs arrows.
		renderLightbox({ images: [images[0]], canNavigate: true })
		expect(
			screen.getByRole("button", { name: /next image/i })
		).toBeInTheDocument()
	})
})
