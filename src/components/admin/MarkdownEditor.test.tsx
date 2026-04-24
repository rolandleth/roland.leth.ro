import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { markdownToReact } from "@/lib/markdown"
import MarkdownEditor from "./MarkdownEditor"

vi.mock("@/lib/markdown", () => ({
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

		await userEvent.type(screen.getByRole("textbox"), "x")

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
		await userEvent.click(screen.getByRole("button", { name: /preview/i }))

		await waitFor(() =>
			expect(screen.getByTestId("parsed")).toBeInTheDocument()
		)
		expect(markdownToReact).toHaveBeenCalledWith("**bold**")
	})

	it("renders a fallback error when markdownToReact rejects", async () => {
		vi.mocked(markdownToReact).mockRejectedValue(new Error("boom"))

		render(<MarkdownEditor value="x" onChange={vi.fn()} />)
		await userEvent.click(screen.getByRole("button", { name: /preview/i }))

		await waitFor(() =>
			expect(screen.getByText(/preview failed to render/i)).toBeInTheDocument()
		)
	})

	it("reuses the last parse when toggling preview off and back on unchanged", async () => {
		// The cache avoids a full unified → rehype re-parse when the user just
		// clicks Edit then Preview without touching the text. Without the cache,
		// markdownToReact would be called twice.
		vi.mocked(markdownToReact).mockResolvedValue(<p>cached</p>)

		render(<MarkdownEditor value="x" onChange={vi.fn()} />)
		await userEvent.click(screen.getByRole("button", { name: /preview/i }))
		await waitFor(() => expect(markdownToReact).toHaveBeenCalledTimes(1))

		await userEvent.click(screen.getByRole("button", { name: /edit/i }))
		await userEvent.click(screen.getByRole("button", { name: /preview/i }))

		// Give the effect a microtask to flush; if the cache works, the count
		// stays at 1.
		await new Promise((r) => setTimeout(r, 0))
		expect(markdownToReact).toHaveBeenCalledTimes(1)
	})
})

// #endregion
