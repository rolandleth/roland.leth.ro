import { render, screen } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
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

const user = setupUser()

beforeEach(() => {
	vi.resetAllMocks()
})

async function expandSearch() {
	// AnimatePresence mode="wait" keeps the icon mounted until exit completes
	// — `findByRole("searchbox")` polls until the form replaces it.
	await user.click(screen.getByRole("button", { name: /search/i }))

	return screen.findByRole("searchbox")
}

describe("AdminSearch — submit URL builder", () => {
	// `?` vs `&` separator was easy to regress with the old pageUrl builders —
	// the projects-tab case pins it. The third case pins query encoding.
	it.each([
		["posts", "hello{enter}", "/admin?q=hello"],
		["projects", "hello{enter}", "/admin?tab=projects&q=hello"],
		["posts", "a&b{enter}", "/admin?q=a%26b"],
	] as const)(
		"tab=%s, typing %j pushes %j",
		async (tab, typed, expectedUrl) => {
			const { push } = mockRouter()
			render(<AdminSearch tab={tab} query="" />)

			const input = await expandSearch()
			await user.type(input, typed)

			expect(push).toHaveBeenCalledWith(expectedUrl)
		}
	)
})

describe("AdminSearch — close behavior", () => {
	it("clears the URL query when closing while a query is set", async () => {
		// `initialValue` non-empty opens the search expanded; clicking X should
		// navigate back to the bare admin tab so the list resets.
		const { replace } = mockRouter()
		render(<AdminSearch tab="posts" query="hello" />)

		await user.click(screen.getByRole("button", { name: /cancel search/i }))

		expect(replace).toHaveBeenCalledWith("/admin")
	})

	it("uses tab=projects in the close-clear URL on the projects tab", async () => {
		const { replace } = mockRouter()
		render(<AdminSearch tab="projects" query="hello" />)

		await user.click(screen.getByRole("button", { name: /cancel search/i }))

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
		await user.click(cancel)

		expect(replace).not.toHaveBeenCalled()
	})
})
