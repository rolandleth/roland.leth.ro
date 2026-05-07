import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AdminSearch from "./AdminSearch"

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

function mockRouter() {
	const push = vi.fn()
	const replace = vi.fn()
	vi.mocked(useRouter).mockReturnValue({
		push,
		replace,
	} as unknown as ReturnType<typeof useRouter>)
	return { push, replace }
}

beforeEach(() => {
	vi.resetAllMocks()
})

async function expandSearch() {
	// AnimatePresence mode="wait" keeps the icon mounted until exit completes
	// — `findByRole("searchbox")` polls until the form replaces it.
	await userEvent.click(screen.getByRole("button", { name: /search/i }))

	return screen.findByRole("searchbox")
}

describe("AdminSearch — submit URL builder", () => {
	it("uses /admin?q=… when on the posts tab", async () => {
		const { push } = mockRouter()
		render(<AdminSearch tab="posts" query="" />)

		const input = await expandSearch()
		await userEvent.type(input, "hello{enter}")

		expect(push).toHaveBeenCalledWith("/admin?q=hello")
	})

	it("uses /admin?tab=projects&q=… when on the projects tab", async () => {
		// `?` vs `&` separator was easy to regress with the old pageUrl
		// builders; the dedicated test pins it.
		const { push } = mockRouter()
		render(<AdminSearch tab="projects" query="" />)

		const input = await expandSearch()
		await userEvent.type(input, "hello{enter}")

		expect(push).toHaveBeenCalledWith("/admin?tab=projects&q=hello")
	})

	it("URL-encodes special characters in the submitted query", async () => {
		const { push } = mockRouter()
		render(<AdminSearch tab="posts" query="" />)

		const input = await expandSearch()
		await userEvent.type(input, "a&b{enter}")

		expect(push).toHaveBeenCalledWith("/admin?q=a%26b")
	})
})

describe("AdminSearch — close behavior", () => {
	it("clears the URL query when closing while a query is set", async () => {
		// `initialValue` non-empty opens the search expanded; clicking X should
		// navigate back to the bare admin tab so the list resets.
		const { replace } = mockRouter()
		render(<AdminSearch tab="posts" query="hello" />)

		await userEvent.click(
			screen.getByRole("button", { name: /cancel search/i })
		)

		expect(replace).toHaveBeenCalledWith("/admin")
	})

	it("uses tab=projects in the close-clear URL on the projects tab", async () => {
		const { replace } = mockRouter()
		render(<AdminSearch tab="projects" query="hello" />)

		await userEvent.click(
			screen.getByRole("button", { name: /cancel search/i })
		)

		expect(replace).toHaveBeenCalledWith("/admin?tab=projects")
	})

	it("does NOT navigate on close when the query was already empty", async () => {
		// Closing the search panel without ever submitting shouldn't push a
		// pointless route change.
		const { replace } = mockRouter()
		render(<AdminSearch tab="posts" query="" />)

		await expandSearch()
		const cancel = await screen.findByRole("button", {
			name: /cancel search/i,
		})
		await userEvent.click(cancel)

		expect(replace).not.toHaveBeenCalled()
	})
})
