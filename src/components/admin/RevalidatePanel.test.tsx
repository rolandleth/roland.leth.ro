import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import RevalidatePanel from "./RevalidatePanel"

const user = setupUser()

function mockFetchOk(
	payload: unknown = { ok: true }
): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		status: 200,
		json: () => Promise.resolve(payload),
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
		const fetchMock = mockFetchOk({
			ok: true,
			applied: { posts: "all" },
			skipped: {},
		})
		render(<RevalidatePanel />)

		await user.click(screen.getByRole("button", { name: /^all posts$/i }))

		expect(lastBody(fetchMock)).toEqual({ posts: "all" })
		await waitFor(() =>
			expect(screen.getByText(/all posts revalidated/i)).toBeInTheDocument()
		)
	})

	it("reports the applied count and warns about skipped entries with the server's reason", async () => {
		mockFetchOk({
			ok: true,
			applied: { posts: ["tech/ok"] },
			skipped: {
				posts: {
					entries: ["junk", "blog/tech/nested"],
					reason: "post entries must be section/slug",
				},
			},
		})
		render(<RevalidatePanel />)

		await user.type(
			screen.getByLabelText(/post slugs to revalidate/i),
			"tech/ok, junk, blog/tech/nested"
		)
		await user.click(
			screen.getAllByRole("button", { name: /revalidate listed/i })[0]
		)

		// The count reflects what the server applied (1), not what was submitted
		// (3) — a dropped entry must never read as revalidated.
		await waitFor(() =>
			expect(screen.getByText(/1 post revalidated/i)).toBeInTheDocument()
		)
		// The reason is rendered verbatim from the server, not hard-coded client-side.
		expect(screen.getByRole("status")).toHaveTextContent(
			"Skipped (not busted): junk, blog/tech/nested — post entries must be section/slug"
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

	it("posts `{ guides: 'all' }` for the All guides button", async () => {
		const fetchMock = mockFetchOk({
			ok: true,
			applied: { guides: "all" },
			skipped: {},
		})
		render(<RevalidatePanel />)

		await user.click(screen.getByRole("button", { name: /^all guides$/i }))

		expect(lastBody(fetchMock)).toEqual({ guides: "all" })
		await waitFor(() =>
			expect(screen.getByText(/all guides revalidated/i)).toBeInTheDocument()
		)
	})

	it("posts listed guide slugs and reports the applied count", async () => {
		const fetchMock = mockFetchOk({
			ok: true,
			applied: { guides: ["decision-journal"] },
			skipped: {},
		})
		render(<RevalidatePanel />)

		await user.type(
			screen.getByLabelText(/guide or topic slugs to revalidate/i),
			"decision-journal"
		)
		await user.click(
			screen.getAllByRole("button", { name: /revalidate listed/i })[2]
		)

		expect(lastBody(fetchMock)).toEqual({ guides: ["decision-journal"] })
		await waitFor(() =>
			expect(screen.getByText(/1 guide revalidated/i)).toBeInTheDocument()
		)
	})

	it("surfaces a per-resource error from a 207 partial response", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 207,
			json: () =>
				Promise.resolve({
					ok: false,
					applied: {},
					skipped: {},
					errors: { guides: "revalidation failed" },
				}),
		})
		render(<RevalidatePanel />)

		await user.click(screen.getByRole("button", { name: /^all guides$/i }))

		await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument())
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

	it("shows the network-error message when the request never completes", async () => {
		// The shared hook maps a rejected fetch to its configured message; this
		// panel's copy went untested when it moved onto the hook.
		vi.spyOn(console, "warn").mockImplementation(() => {})
		global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
		render(<RevalidatePanel />)

		await user.click(screen.getByRole("button", { name: /^all posts$/i }))

		await waitFor(() =>
			expect(screen.getByRole("alert")).toHaveTextContent(
				/revalidate failed \(network error\)/i
			)
		)
	})

	it("disables the buttons and marks aria-busy while a request is in flight", async () => {
		let release!: (value: unknown) => void
		global.fetch = vi.fn().mockReturnValue(
			new Promise((resolve) => {
				release = resolve
			})
		)
		render(<RevalidatePanel />)

		await user.click(screen.getByRole("button", { name: /^all posts$/i }))

		const busy = await screen.findByRole("button", { name: /^revalidating…$/i })
		expect(busy).toBeDisabled()
		expect(busy).toHaveAttribute("aria-busy", "true")

		release({
			ok: true,
			status: 200,
			json: () =>
				Promise.resolve({ ok: true, applied: { posts: "all" }, skipped: {} }),
		})

		await waitFor(() =>
			expect(screen.getByRole("button", { name: /^all posts$/i })).toBeEnabled()
		)
	})

	it("exposes a live region before any request runs", () => {
		render(<RevalidatePanel />)

		expect(screen.getByRole("status")).toBeInTheDocument()
	})

	it("ties every button to both the outcome and error regions", () => {
		render(<RevalidatePanel />)

		for (const button of screen.getAllByRole("button")) {
			expect(button).toHaveAttribute(
				"aria-controls",
				"revalidate-outcome revalidate-error"
			)
		}

		expect(document.getElementById("revalidate-outcome")).not.toBeNull()
		expect(document.getElementById("revalidate-error")).not.toBeNull()
	})
})
