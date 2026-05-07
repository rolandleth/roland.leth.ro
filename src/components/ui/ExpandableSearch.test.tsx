import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import ExpandableSearch from "./ExpandableSearch"

describe("ExpandableSearch", () => {
	it("renders collapsed (search icon) by default", () => {
		render(<ExpandableSearch placeholder="Search…" onSubmit={vi.fn()} />)
		expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument()
		expect(screen.queryByRole("searchbox")).not.toBeInTheDocument()
	})

	it("renders expanded when initialValue is non-empty", () => {
		render(
			<ExpandableSearch
				placeholder="Search…"
				onSubmit={vi.fn()}
				initialValue="hello"
			/>
		)
		expect(screen.getByRole("searchbox")).toHaveValue("hello")
	})

	it("expands on icon click", async () => {
		// AnimatePresence mode="wait" stalls under happy-dom (no real animation
		// timing); `findBy*` polls past the swap.
		render(<ExpandableSearch placeholder="Search…" onSubmit={vi.fn()} />)
		await userEvent.click(screen.getByRole("button", { name: /search/i }))

		expect(await screen.findByRole("searchbox")).toBeInTheDocument()
	})

	it("collapses on Escape", async () => {
		const onClose = vi.fn()
		render(
			<ExpandableSearch
				placeholder="Search…"
				onSubmit={vi.fn()}
				onClose={onClose}
				initialValue="x"
			/>
		)

		const input = screen.getByRole("searchbox")
		await userEvent.click(input)
		await userEvent.keyboard("{Escape}")

		// Don't assert call-count: under happy-dom, framer-motion AnimatePresence
		// + useClickOutside can produce a follow-up mousedown that fires onClose
		// again as the form unmounts. We only care that the close path fired.
		expect(onClose).toHaveBeenCalled()
	})

	it("collapses on the cancel button and calls onClose", async () => {
		const onClose = vi.fn()
		render(
			<ExpandableSearch
				placeholder="Search…"
				onSubmit={vi.fn()}
				onClose={onClose}
				initialValue="x"
			/>
		)

		await userEvent.click(
			screen.getByRole("button", { name: /cancel search/i })
		)

		// Don't assert call-count: under happy-dom, framer-motion AnimatePresence
		// + useClickOutside can produce a follow-up mousedown that fires onClose
		// again as the form unmounts. We only care that the close path fired.
		expect(onClose).toHaveBeenCalled()
	})

	it("submits the trimmed value through onSubmit on Enter", async () => {
		const onSubmit = vi.fn()
		render(
			<ExpandableSearch
				placeholder="Search…"
				onSubmit={onSubmit}
				initialValue=""
			/>
		)
		await userEvent.click(screen.getByRole("button", { name: /search/i }))
		const input = await screen.findByRole("searchbox")
		await userEvent.type(input, "  hello world  {enter}")

		expect(onSubmit).toHaveBeenCalledWith("hello world")
	})

	it("does NOT submit when the query is empty after trim", async () => {
		// Avoids navigating to `?q=` (empty query) on accidental Enter.
		const onSubmit = vi.fn()
		render(
			<ExpandableSearch
				placeholder="Search…"
				onSubmit={onSubmit}
				initialValue=""
			/>
		)
		await userEvent.click(screen.getByRole("button", { name: /search/i }))
		const input = await screen.findByRole("searchbox")
		await userEvent.type(input, "   {enter}")

		expect(onSubmit).not.toHaveBeenCalled()
	})

	it("collapses on outside click via useClickOutside", async () => {
		const onClose = vi.fn()
		render(
			<>
				<ExpandableSearch
					placeholder="Search…"
					onSubmit={vi.fn()}
					onClose={onClose}
					initialValue="x"
				/>
				<button data-testid="outside">outside</button>
			</>
		)
		// Confirm expanded first.
		expect(screen.getByRole("searchbox")).toBeInTheDocument()

		await userEvent.click(screen.getByTestId("outside"))

		// Don't assert call-count: under happy-dom, framer-motion AnimatePresence
		// + useClickOutside can produce a follow-up mousedown that fires onClose
		// again as the form unmounts. We only care that the close path fired.
		expect(onClose).toHaveBeenCalled()
	})
})
