import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createRef, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { markdownToReact } from "@/lib/content/markdown"
import { setupUser } from "@/test/user"
import MarkdownEditor from "./MarkdownEditor"
import type { MarkdownEditorHandle } from "./MarkdownEditor"
import type { RefObject } from "react"

const user = setupUser()

vi.mock("@/lib/content/markdown", () => ({
	markdownToReact: vi.fn(),
}))

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Edit mode

describe("MarkdownEditor edit mode", () => {
	it("renders the value in a textarea by default", () => {
		render(<MarkdownEditor value="hello world" onChange={vi.fn()} />)
		expect(screen.getByRole("textbox")).toHaveValue("hello world")
	})

	it("calls onChange with the keystroke when the textarea is edited", async () => {
		// Controlled component — the parent owns the value. Typing "h" into an
		// initially-empty textarea results in `onChange("h")`; the component
		// does not accumulate state of its own.
		const onChange = vi.fn()
		render(<MarkdownEditor value="" onChange={onChange} />)

		await user.type(screen.getByRole("textbox"), "x")

		expect(onChange).toHaveBeenCalledWith("x")
	})
})

// #endregion

// #region Preview mode

describe("MarkdownEditor preview mode", () => {
	it("parses the current value via markdownToReact when toggled to Preview", async () => {
		vi.mocked(markdownToReact).mockResolvedValue(
			<p data-testid="parsed">Parsed output</p>
		)

		render(<MarkdownEditor value="**bold**" onChange={vi.fn()} />)
		await user.click(screen.getByRole("button", { name: /preview/i }))

		await waitFor(() =>
			expect(screen.getByTestId("parsed")).toBeInTheDocument()
		)
		expect(markdownToReact).toHaveBeenCalledWith("**bold**")
	})

	it("renders a fallback error when markdownToReact rejects", async () => {
		vi.mocked(markdownToReact).mockRejectedValue(new Error("boom"))

		render(<MarkdownEditor value="x" onChange={vi.fn()} />)
		await user.click(screen.getByRole("button", { name: /preview/i }))

		await waitFor(() =>
			expect(screen.getByText(/preview failed to render/i)).toBeInTheDocument()
		)
	})

	it("clears the previous render synchronously on a cache miss so the Rendering placeholder shows", async () => {
		// Phase 6 fix: when the user edits the text and re-opens Preview, the
		// effect previously kept the prior parsed body in `preview` until the
		// async pipeline resolved, so the stale render flashed briefly. Now
		// the cache-miss branch calls `setPreview(null)` synchronously so the
		// "Rendering…" placeholder appears while parsing runs.
		let resolveParse: ((node: React.ReactNode) => void) | undefined
		vi.mocked(markdownToReact)
			.mockResolvedValueOnce(<p>first</p>)
			.mockImplementationOnce(
				() =>
					new Promise<React.ReactNode>((resolve) => {
						resolveParse = resolve
					})
			)

		const { rerender } = render(
			<MarkdownEditor value="first text" onChange={vi.fn()} />
		)
		await user.click(screen.getByRole("button", { name: /preview/i }))
		await waitFor(() => expect(screen.getByText("first")).toBeInTheDocument())

		// Edit happens behind the scenes (textarea unmounted while in Preview),
		// so simulate by re-rendering with a new value still in Preview mode.
		rerender(<MarkdownEditor value="second text" onChange={vi.fn()} />)

		// The pipeline hasn't resolved for "second text" yet; the prior render
		// must NOT be on screen, and the placeholder must be.
		await waitFor(() =>
			expect(screen.getByText(/rendering…/i)).toBeInTheDocument()
		)
		expect(screen.queryByText("first")).not.toBeInTheDocument()

		// Resolve the second parse so React doesn't warn about pending state.
		resolveParse?.(<p>second</p>)
		await waitFor(() => expect(screen.getByText("second")).toBeInTheDocument())
	})

	it("reuses the last parse when toggling preview off and back on unchanged", async () => {
		// The cache avoids a full unified → rehype re-parse when the user just
		// clicks Edit then Preview without touching the text. Without the cache,
		// markdownToReact would be called twice.
		vi.mocked(markdownToReact).mockResolvedValue(<p>cached</p>)

		render(<MarkdownEditor value="x" onChange={vi.fn()} />)
		await user.click(screen.getByRole("button", { name: /preview/i }))
		await waitFor(() => expect(markdownToReact).toHaveBeenCalledTimes(1))

		await user.click(screen.getByRole("button", { name: /edit/i }))
		await user.click(screen.getByRole("button", { name: /preview/i }))

		// Give the effect a microtask to flush; if the cache works, the count
		// stays at 1.
		await new Promise((r) => setTimeout(r, 0))
		expect(markdownToReact).toHaveBeenCalledTimes(1)
	})
})

// #endregion

// #region Inserting a block

describe("MarkdownEditor insertBlock", () => {
	const BLOCK = "![](https://example.com/clip.mp4)"

	/** The editor with a parent that owns the value, as a form does. */
	function ControlledEditor({
		initialValue,
		editorRef,
	}: {
		initialValue: string
		editorRef: RefObject<MarkdownEditorHandle | null>
	}) {
		const [value, setValue] = useState(initialValue)

		return <MarkdownEditor ref={editorRef} value={value} onChange={setValue} />
	}

	function renderEditor(initialValue: string) {
		const editorRef = createRef<MarkdownEditorHandle>()

		render(
			<ControlledEditor initialValue={initialValue} editorRef={editorRef} />
		)

		return editorRef
	}

	function textarea(): HTMLTextAreaElement {
		return screen.getByRole("textbox")
	}

	/** Moves the cursor the way a click or an arrow key does. */
	function placeCursor(start: number, end = start) {
		textarea().setSelectionRange(start, end)
		fireEvent.select(textarea())
	}

	it("appends the block when the textarea never had a cursor", () => {
		const editorRef = renderEditor("Intro.")

		act(() => editorRef.current?.insertBlock(BLOCK))

		expect(textarea()).toHaveValue(`Intro.\n\n${BLOCK}`)
	})

	it("inserts the block as the whole value of an empty editor", () => {
		const editorRef = renderEditor("")

		act(() => editorRef.current?.insertBlock(BLOCK))

		expect(textarea()).toHaveValue(BLOCK)
	})

	it("inserts next to the cursor, not at the end", () => {
		const editorRef = renderEditor("One.\n\nTwo.")

		placeCursor(2)
		act(() => editorRef.current?.insertBlock(BLOCK))

		expect(textarea()).toHaveValue(`One.\n\n${BLOCK}\n\nTwo.`)
	})

	it("keeps selected text and inserts after its line", () => {
		const editorRef = renderEditor("Keep all of this.\n\nAnd this.")

		placeCursor(5, 8)
		act(() => editorRef.current?.insertBlock(BLOCK))

		expect(textarea()).toHaveValue(`Keep all of this.\n\n${BLOCK}\n\nAnd this.`)
	})

	it("follows the cursor as the author types", async () => {
		const editorRef = renderEditor("")

		await user.type(textarea(), "Typed.")
		act(() => editorRef.current?.insertBlock(BLOCK))

		expect(textarea()).toHaveValue(`Typed.\n\n${BLOCK}`)
	})

	it("puts the cursor after the block by default and focuses the textarea", () => {
		const editorRef = renderEditor("Intro.\n\nOutro.")

		placeCursor(3)
		act(() => editorRef.current?.insertBlock(BLOCK))

		const blockEnd = "Intro.\n\n".length + BLOCK.length

		expect(textarea()).toHaveFocus()
		expect(textarea().selectionStart).toBe(blockEnd)
		expect(textarea().selectionEnd).toBe(blockEnd)
	})

	it("puts the cursor at the given offset into the block", () => {
		const editorRef = renderEditor("Intro.")

		act(() => editorRef.current?.insertBlock(BLOCK, 2))

		// Inside the `![` `]` pair, where the alt text goes.
		const altStart = "Intro.\n\n![".length

		expect(textarea().selectionStart).toBe(altStart)
		expect(textarea().selectionEnd).toBe(altStart)
	})

	it("stacks a second block after the first without splitting it", () => {
		// The first insert leaves the cursor inside the block's alt text.
		const editorRef = renderEditor("Intro.")

		act(() => editorRef.current?.insertBlock(BLOCK, 2))
		act(() => editorRef.current?.insertBlock("![](second.mp4)", 2))

		expect(textarea()).toHaveValue(`Intro.\n\n${BLOCK}\n\n![](second.mp4)`)
	})

	it("inserts at the remembered cursor while in preview", async () => {
		vi.mocked(markdownToReact).mockResolvedValue(<p>parsed</p>)
		const editorRef = renderEditor("One.\n\nTwo.")

		placeCursor(2)
		await user.click(screen.getByRole("button", { name: /preview/i }))
		act(() => editorRef.current?.insertBlock(BLOCK, 2))
		await user.click(screen.getByRole("button", { name: /edit/i }))

		expect(textarea()).toHaveValue(`One.\n\n${BLOCK}\n\nTwo.`)
	})

	it("moves the cursor into a block inserted in preview once Edit is back", async () => {
		vi.mocked(markdownToReact).mockResolvedValue(<p>parsed</p>)
		const editorRef = renderEditor("Intro.")

		await user.click(screen.getByRole("button", { name: /preview/i }))
		act(() => editorRef.current?.insertBlock(BLOCK, 2))
		await user.click(screen.getByRole("button", { name: /edit/i }))

		const altStart = "Intro.\n\n![".length

		expect(textarea()).toHaveFocus()
		expect(textarea().selectionStart).toBe(altStart)
	})

	it("does not move the cursor on an ordinary edit", async () => {
		const editorRef = renderEditor("Intro.")

		act(() => editorRef.current?.insertBlock(BLOCK))
		placeCursor(0)
		await user.type(textarea(), "X", {
			initialSelectionStart: 0,
			initialSelectionEnd: 0,
		})

		// Typing at the start leaves the cursor after the typed character; a
		// stale pending cursor would have thrown it back to the block.
		expect(textarea().selectionStart).toBe(1)
	})
})

// #endregion
