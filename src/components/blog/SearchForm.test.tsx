import { render, screen } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import SearchForm from "./SearchForm"

const user = setupUser()

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

function mockRouter() {
	const push = vi.fn()
	vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<
		typeof useRouter
	>)
	return { push }
}

beforeEach(() => {
	vi.resetAllMocks()
})

describe("SearchForm — imperative focus (Phase 8)", () => {
	it("focuses the input on mount when autoFocus is true", () => {
		// Phase 8 swap: the prior version set the declarative `autoFocus`
		// attribute on the input, which fires synchronously during render and
		// raced AnimatePresence's enter transition. The fix moves focus into a
		// layout-time `useEffect` keyed on `autoFocus`. Pin so a regression to
		// the declarative attribute (or dropping the effect) surfaces.
		mockRouter()
		render(<SearchForm section="tech" autoFocus />)
		const input = screen.getByRole("searchbox")
		expect(input).toHaveFocus()
	})

	it("does not focus the input on mount when autoFocus is false/omitted", () => {
		mockRouter()
		render(<SearchForm section="tech" />)
		const input = screen.getByRole("searchbox")
		expect(input).not.toHaveFocus()
	})

	it("does not set the native autoFocus attribute on the input", () => {
		// Regression guard for the declarative-vs-imperative choice.
		mockRouter()
		render(<SearchForm section="tech" autoFocus />)
		const input = screen.getByRole("searchbox")
		expect(input).not.toHaveAttribute("autoFocus")
	})
})

describe("SearchForm — Escape callback", () => {
	it("calls onKeyDownEscape when Escape is pressed in the input", async () => {
		mockRouter()
		const onKeyDownEscape = vi.fn()
		render(
			<SearchForm section="tech" autoFocus onKeyDownEscape={onKeyDownEscape} />
		)
		await user.keyboard("{Escape}")
		expect(onKeyDownEscape).toHaveBeenCalledTimes(1)
	})

	it("does nothing on Escape when no callback is provided", async () => {
		mockRouter()
		render(<SearchForm section="tech" autoFocus />)
		// Just asserts no throw — Escape with no handler is a no-op.
		await expect(user.keyboard("{Escape}")).resolves.not.toThrow()
	})
})
