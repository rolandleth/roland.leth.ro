import { act, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderOrderedList } from "@/test/renderOrderedList"
import { setupUser } from "@/test/user"
import SectionManager, { type SectionItem } from "./SectionManager"

const user = setupUser()

// MarkdownEditor pulls `@/lib/markdown` which loads the remark/rehype pipeline
// at import. Stub to a plain textarea so these tests focus on SectionManager's
// add/remove/reorder contract, not the markdown parse path.
vi.mock("./MarkdownEditor", () => ({
	default: ({
		value,
		onChange,
	}: {
		value: string
		onChange: (v: string) => void
	}) => (
		<textarea
			data-testid="markdown-editor"
			value={value}
			onChange={(e) => onChange(e.target.value)}
		/>
	),
}))

/**
 * Uploads started through the stubbed `ImageUpload`, each holding the
 * `onChange` from the render in which its file was picked — what the real
 * component's `handleFileChange` closure holds while its fetch is in flight.
 */
const pendingUploads: { finish: (url: string) => void }[] = []

vi.mock("./ImageUpload", async () => {
	const { useEffect, useRef } = await import("react")

	return {
		default: function ImageUploadStub({
			value,
			onChange,
			onUploadingChange,
		}: {
			value: string
			onChange: (url: string) => void
			onUploadingChange?: (isUploading: boolean) => void
		}) {
			const isUploadingRef = useRef(false)
			const reportRef = useRef(onUploadingChange)
			reportRef.current = onUploadingChange

			// Like the real component: unmounting mid-upload aborts it and reports
			// that nothing is in flight any more.
			useEffect(
				() => () => {
					if (isUploadingRef.current) {
						reportRef.current?.(false)
					}
				},
				[]
			)

			return (
				<div>
					<input
						data-testid="image-upload"
						value={value}
						onChange={(e) => onChange(e.target.value)}
					/>
					<button
						type="button"
						onClick={() => {
							isUploadingRef.current = true
							onUploadingChange?.(true)
							pendingUploads.push({ finish: onChange })
						}}
					>
						Pick file
					</button>
				</div>
			)
		},
	}
})

function makeSection(partial: Partial<SectionItem> = {}): SectionItem {
	return {
		_key: partial._key ?? "k",
		title: partial.title ?? "Overview",
		description: partial.description ?? "Body",
		sortOrder: partial.sortOrder ?? 0,
		hasPlans: partial.hasPlans ?? false,
		images: partial.images ?? [],
	}
}

function renderSections(
	initial: SectionItem[],
	onUploadingChange?: (imageKey: string, isUploading: boolean) => void
) {
	return renderOrderedList(initial, (value, onChange) => (
		<SectionManager
			value={value}
			onChange={onChange}
			onUploadingChange={onUploadingChange}
		/>
	))
}

beforeEach(() => {
	vi.resetAllMocks()
	pendingUploads.length = 0
})

// #region Add

describe("SectionManager add", () => {
	it("appends an empty section with the next sortOrder when Add section is clicked", async () => {
		const { latest } = renderSections([
			makeSection({ _key: "a", sortOrder: 0 }),
		])
		await user.click(screen.getByRole("button", { name: /add section/i }))

		const next = latest()
		expect(next).toHaveLength(2)
		expect(next[1]).toMatchObject({
			title: "",
			description: "",
			sortOrder: 1,
			hasPlans: false,
			images: [],
		})
		expect(typeof next[1]._key).toBe("string")
	})

	it("adds an image with empty caption and alt", async () => {
		const { latest } = renderSections([makeSection({ _key: "a" })])
		await user.click(screen.getByRole("button", { name: "Add image" }))

		expect(latest()[0].images[0]).toMatchObject({
			url: "",
			caption: "",
			alt: "",
		})
	})
})

// #endregion

// #region Product-page fields

describe("SectionManager product-page fields", () => {
	it("sets and clears the plans flag on the targeted section only", async () => {
		const { latest } = renderSections([
			makeSection({ _key: "a", title: "Alpha" }),
			makeSection({ _key: "b", title: "Beta" }),
		])
		const checkboxes = screen.getAllByRole("checkbox", {
			name: /show the plan cards in this section/i,
		})

		await user.click(checkboxes[1])
		expect(latest().map((s) => s.hasPlans)).toEqual([false, true])

		await user.click(checkboxes[1])
		expect(latest().map((s) => s.hasPlans)).toEqual([false, false])
	})

	it("edits the alt text of the targeted image only", async () => {
		const { latest } = renderSections([
			makeSection({
				_key: "a",
				images: [
					{ _key: "img-1", url: "", caption: "One", alt: "", sortOrder: 0 },
					{ _key: "img-2", url: "", caption: "Two", alt: "", sortOrder: 1 },
				],
			}),
		])

		await user.type(screen.getAllByLabelText("Alt text")[1], "Second")

		expect(latest()[0].images.map((image) => image.alt)).toEqual(["", "Second"])
	})
})

// #endregion

// #region Remove / reindex

describe("SectionManager remove + reindex", () => {
	it("removes the targeted section and compacts sortOrder values", async () => {
		const { latest } = renderSections([
			makeSection({ _key: "a", title: "Alpha", sortOrder: 0 }),
			makeSection({ _key: "b", title: "Beta", sortOrder: 1 }),
			makeSection({ _key: "c", title: "Charlie", sortOrder: 2 }),
		])
		const removeButtons = screen.getAllByRole("button", { name: /remove/i })
		// Click the middle section's remove.
		await user.click(removeButtons[1])

		const next = latest()
		expect(next.map((s) => s.title)).toEqual(["Alpha", "Charlie"])
		expect(next.map((s) => s.sortOrder)).toEqual([0, 1])
	})
})

// #endregion

// #region Title update

describe("SectionManager update", () => {
	it("updates only the targeted section's title", async () => {
		const { latest } = renderSections([
			makeSection({ _key: "a", title: "Alpha" }),
			makeSection({ _key: "b", title: "Beta" }),
		])
		const titleInputs = screen.getAllByPlaceholderText("Section title")
		await user.type(titleInputs[0], "!")

		const last = latest()
		expect(last[0].title).toBe("Alpha!")
		expect(last[1].title).toBe("Beta")
	})
})

// #endregion

// #region Image upload finishing after other edits

describe("SectionManager image upload finishing late", () => {
	const imageSection = (key: string, title: string, sortOrder: number) =>
		makeSection({
			_key: key,
			title,
			sortOrder,
			images: [
				{ _key: `${key}-img`, url: "", caption: "", alt: "", sortOrder: 0 },
			],
		})

	it("keeps edits made while the upload was in flight", async () => {
		const { latest } = renderSections([
			imageSection("a", "Alpha", 0),
			imageSection("b", "Beta", 1),
		])
		// Pick a file for Beta's image, then keep editing before it lands.
		await user.click(screen.getAllByRole("button", { name: "Pick file" })[1])
		await user.type(screen.getAllByPlaceholderText("Section title")[0], "!")
		// Move-up controls in DOM order: Alpha, Alpha's image, Beta, Beta's image.
		await user.click(screen.getAllByRole("button", { name: "Move up" })[2])

		act(() => {
			pendingUploads[0].finish("https://blob.example/beta.png")
		})

		const sections = latest()
		// The reorder and the title edit both survive…
		expect(sections.map((s) => s.title)).toEqual(["Beta", "Alpha!"])
		expect(sections.map((s) => s.sortOrder)).toEqual([0, 1])
		// …and the URL lands on the image it was picked for, not on the section
		// that now sits at Beta's old index.
		expect(sections[0].images[0].url).toBe("https://blob.example/beta.png")
		expect(sections[1].images[0].url).toBe("")
	})

	it("keeps both URLs when two uploads finish back to back", async () => {
		const { latest } = renderSections([
			imageSection("a", "Alpha", 0),
			imageSection("b", "Beta", 1),
		])
		const pickButtons = screen.getAllByRole("button", { name: "Pick file" })
		await user.click(pickButtons[0])
		await user.click(pickButtons[1])

		act(() => {
			pendingUploads[0].finish("https://blob.example/alpha.png")
			pendingUploads[1].finish("https://blob.example/beta.png")
		})

		const sections = latest()
		expect(sections[0].images[0].url).toBe("https://blob.example/alpha.png")
		expect(sections[1].images[0].url).toBe("https://blob.example/beta.png")
	})

	it("drops the URL when its section was removed in the meantime", async () => {
		const { latest } = renderSections([
			imageSection("a", "Alpha", 0),
			imageSection("b", "Beta", 1),
		])
		await user.click(screen.getAllByRole("button", { name: "Pick file" })[1])
		// Section "Remove" controls come first in each card, image ones after.
		const removeButtons = screen.getAllByRole("button", { name: /remove/i })
		await user.click(removeButtons[2])

		act(() => {
			pendingUploads[0].finish("https://blob.example/beta.png")
		})

		const sections = latest()
		expect(sections.map((s) => s.title)).toEqual(["Alpha"])
		expect(sections[0].images[0].url).toBe("")
	})

	it("reports uploads to the form keyed by image", async () => {
		const onUploadingChange = vi.fn()
		renderSections([imageSection("a", "Alpha", 0)], onUploadingChange)

		await user.click(screen.getByRole("button", { name: "Pick file" }))

		expect(onUploadingChange).toHaveBeenCalledWith("a-img", true)
	})

	it("keeps an upload running when its section is collapsed", async () => {
		// Collapsing used to unmount the uploader, which aborted the upload and
		// dropped the picked image without a message.
		const onUploadingChange = vi.fn()
		const { latest } = renderSections(
			[imageSection("a", "Alpha", 0)],
			onUploadingChange
		)
		await user.click(screen.getByRole("button", { name: "Pick file" }))

		await user.click(screen.getByRole("button", { name: "Collapse section" }))

		expect(onUploadingChange).not.toHaveBeenCalledWith("a-img", false)

		act(() => {
			pendingUploads[0].finish("https://blob.example/alpha.png")
		})

		expect(latest()[0].images[0].url).toBe("https://blob.example/alpha.png")
	})

	it("hides a collapsed section's content and shows it again on expand", async () => {
		renderSections([imageSection("a", "Alpha", 0)])

		await user.click(screen.getByRole("button", { name: "Collapse section" }))

		expect(
			screen.queryByRole("button", { name: "Add image" })
		).not.toBeInTheDocument()

		await user.click(screen.getByRole("button", { name: "Expand section" }))

		expect(screen.getByRole("button", { name: "Add image" })).toBeVisible()
	})

	const twoImageSection = () =>
		makeSection({
			_key: "a",
			images: [
				{ _key: "img-1", url: "", caption: "One", alt: "", sortOrder: 0 },
				{ _key: "img-2", url: "", caption: "Two", alt: "", sortOrder: 1 },
			],
		})

	it("drops the URL when its image was removed in the meantime", async () => {
		const { latest } = renderSections([twoImageSection()])
		await user.click(screen.getAllByRole("button", { name: "Pick file" })[1])
		// Remove controls in DOM order: the section, image one, image two.
		await user.click(screen.getAllByRole("button", { name: /remove/i })[2])

		act(() => {
			pendingUploads[0].finish("https://blob.example/two.png")
		})

		const images = latest()[0].images
		expect(images.map((image) => image._key)).toEqual(["img-1"])
		expect(images[0].url).toBe("")
	})

	it("lands the URL on its image after that image was moved", async () => {
		const { latest } = renderSections([twoImageSection()])
		await user.click(screen.getAllByRole("button", { name: "Pick file" })[1])
		// Move-up controls in DOM order: the section, image one, image two.
		await user.click(screen.getAllByRole("button", { name: "Move up" })[2])

		act(() => {
			pendingUploads[0].finish("https://blob.example/two.png")
		})

		const images = latest()[0].images
		expect(images.map((image) => image._key)).toEqual(["img-2", "img-1"])
		expect(images[0].url).toBe("https://blob.example/two.png")
		expect(images[1].url).toBe("")
	})
})

// #endregion
