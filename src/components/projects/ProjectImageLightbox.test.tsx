import { render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import ProjectImageLightbox from "./ProjectImageLightbox"
import type { GalleryImage } from "@/lib/client/gallery"

const user = setupUser()

vi.mock("next/image", () => ({
	default: (props: Record<string, unknown>) => {
		// eslint-disable-next-line @next/next/no-img-element
		return <img alt={props.alt as string} src={props.src as string} />
	},
}))

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

function noop() {}

function renderLightbox(
	overrides: Partial<React.ComponentProps<typeof ProjectImageLightbox>> = {}
) {
	const props = {
		isOpen: true,
		images,
		index: 0,
		galleryLabel: "MyApp",
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

	it("lays the whole gallery out as one strip", () => {
		// Every slide is in the DOM (the continuous track); the current one is the
		// only one exposed to assistive tech, the rest are aria-hidden.
		renderLightbox()
		expect(screen.getByAltText("First slide")).toBeInTheDocument()
		expect(screen.getByAltText("Second slide")).toBeInTheDocument()
	})

	it("falls back to an alt derived from the section title when the caption is null", () => {
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

	it("focuses the close button on open and restores focus to the trigger on close", async () => {
		// Trigger lives outside the lightbox; mounting the lightbox closed first
		// lets us focus the trigger before the dialog appears, mirroring the real
		// flow where a gallery thumbnail opens the overlay.
		function Harness() {
			const [open, setOpen] = useState(false)

			return (
				<>
					<button type="button" onClick={() => setOpen(true)}>
						trigger
					</button>
					<ProjectImageLightbox
						isOpen={open}
						images={images}
						index={0}
						galleryLabel="MyApp"
						canNavigate={true}
						onClose={() => setOpen(false)}
						onPrev={noop}
						onNext={noop}
					/>
				</>
			)
		}

		render(<Harness />)
		const trigger = screen.getByRole("button", { name: "trigger" })
		trigger.focus()
		await user.click(trigger)
		expect(
			screen.getByRole("button", { name: /close enlarged image/i })
		).toHaveFocus()

		await user.keyboard("{Escape}")
		expect(trigger).toHaveFocus()
	})

	it("locks body scroll while open and restores the previous overflow on close", () => {
		document.body.style.overflow = "auto"

		const { rerender } = render(
			<ProjectImageLightbox
				isOpen={true}
				images={images}
				index={0}
				galleryLabel="MyApp"
				canNavigate={true}
				onClose={noop}
				onPrev={noop}
				onNext={noop}
			/>
		)
		expect(document.body.style.overflow).toBe("hidden")

		rerender(
			<ProjectImageLightbox
				isOpen={false}
				images={images}
				index={0}
				galleryLabel="MyApp"
				canNavigate={true}
				onClose={noop}
				onPrev={noop}
				onNext={noop}
			/>
		)
		expect(document.body.style.overflow).toBe("auto")
	})

	it("traps Tab focus within the dialog so it can't escape into the page behind", async () => {
		renderLightbox()
		const closeButton = screen.getByRole("button", {
			name: /close enlarged image/i,
		})
		const nextButton = screen.getByRole("button", { name: /next image/i })

		// Start with the close button focused (mount behaviour) and Shift+Tab —
		// focus should wrap to the last focusable element rather than leave the
		// dialog.
		closeButton.focus()
		await user.keyboard("{Shift>}{Tab}{/Shift}")
		expect(nextButton).toHaveFocus()

		// Forward Tab from the last focusable wraps to the first.
		await user.keyboard("{Tab}")
		expect(closeButton).toHaveFocus()
	})

	it("wraps Tab to itself when the close button is the only focusable (canNavigate: false)", async () => {
		// No arrows means the close button is both first and last focusable, so the
		// trap must keep focus on it in either Tab direction rather than escape.
		renderLightbox({ images: [images[0]], canNavigate: false })
		const closeButton = screen.getByRole("button", {
			name: /close enlarged image/i,
		})

		closeButton.focus()
		await user.keyboard("{Tab}")
		expect(closeButton).toHaveFocus()

		await user.keyboard("{Shift>}{Tab}{/Shift}")
		expect(closeButton).toHaveFocus()
	})

	it("restores a pre-existing hidden overflow on close, not a blank value", () => {
		// The scroll lock captures whatever overflow was set at mount. If another
		// overlay already set `hidden`, closing must restore `hidden` — not reset to
		// "" and let the page scroll while the other overlay is still up.
		document.body.style.overflow = "hidden"

		const { rerender } = render(
			<ProjectImageLightbox
				isOpen={true}
				images={images}
				index={0}
				galleryLabel="MyApp"
				canNavigate={true}
				onClose={noop}
				onPrev={noop}
				onNext={noop}
			/>
		)
		expect(document.body.style.overflow).toBe("hidden")

		rerender(
			<ProjectImageLightbox
				isOpen={false}
				images={images}
				index={0}
				galleryLabel="MyApp"
				canNavigate={true}
				onClose={noop}
				onPrev={noop}
				onNext={noop}
			/>
		)
		expect(document.body.style.overflow).toBe("hidden")

		document.body.style.overflow = ""
	})

	it("restores focus to <body> when nothing was focused before opening", () => {
		// No trigger focused → `activeElement` is <body>. On close the restore step
		// must no-op gracefully (the `?.` guard) rather than throw, landing focus
		// back on <body> instead of leaving it stranded on the close button.
		;(document.activeElement as HTMLElement | null)?.blur()

		const { rerender } = render(
			<ProjectImageLightbox
				isOpen={true}
				images={images}
				index={0}
				galleryLabel="MyApp"
				canNavigate={true}
				onClose={noop}
				onPrev={noop}
				onNext={noop}
			/>
		)
		expect(
			screen.getByRole("button", { name: /close enlarged image/i })
		).toHaveFocus()

		rerender(
			<ProjectImageLightbox
				isOpen={false}
				images={images}
				index={0}
				galleryLabel="MyApp"
				canNavigate={true}
				onClose={noop}
				onPrev={noop}
				onNext={noop}
			/>
		)
		expect(document.activeElement).toBe(document.body)
	})
})
