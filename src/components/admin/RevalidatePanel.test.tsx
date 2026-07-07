import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import RevalidatePanel from "./RevalidatePanel"

const user = setupUser()

function mockFetchOk(): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		status: 200,
		json: () => Promise.resolve({ ok: true }),
	})
	global.fetch = fetchMock

	return fetchMock
}

function lastBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
	const call = fetchMock.mock.calls.at(-1)

	return JSON.parse((call?.[1] as RequestInit).body as string)
}

beforeEach(() => {
	vi.clearAllMocks()
})

describe("RevalidatePanel", () => {
	it("posts `{ posts: 'all' }` for the All posts button", async () => {
		const fetchMock = mockFetchOk()
		render(<RevalidatePanel />)

		await user.click(screen.getByRole("button", { name: /^all posts$/i }))

		expect(lastBody(fetchMock)).toEqual({ posts: "all" })
		await waitFor(() =>
			expect(screen.getByText(/all posts revalidated/i)).toBeInTheDocument()
		)
	})

	it("parses the posts input into a section/slug list", async () => {
		const fetchMock = mockFetchOk()
		render(<RevalidatePanel />)

		await user.type(
			screen.getByLabelText(/post slugs to revalidate/i),
			"tech/foo, life/bar"
		)
		await user.click(
			screen.getAllByRole("button", { name: /revalidate listed/i })[0]
		)

		expect(lastBody(fetchMock)).toEqual({ posts: ["tech/foo", "life/bar"] })
	})

	it("posts `{ projects: 'all' }` for the All projects button", async () => {
		const fetchMock = mockFetchOk()
		render(<RevalidatePanel />)

		await user.click(screen.getByRole("button", { name: /^all projects$/i }))

		expect(lastBody(fetchMock)).toEqual({ projects: "all" })
	})

	it("disables 'Revalidate listed' until the input has tokens", async () => {
		render(<RevalidatePanel />)

		const postsListed = screen.getAllByRole("button", {
			name: /revalidate listed/i,
		})[0]
		expect(postsListed).toBeDisabled()

		await user.type(
			screen.getByLabelText(/post slugs to revalidate/i),
			"tech/foo"
		)
		expect(postsListed).not.toBeDisabled()
	})

	it("surfaces a server error", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
			headers: new Headers({ "content-type": "application/json" }),
			json: () => Promise.resolve({ error: "Provide posts and/or projects" }),
		})
		render(<RevalidatePanel />)

		await user.click(screen.getByRole("button", { name: /^all posts$/i }))

		await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument())
	})
})
