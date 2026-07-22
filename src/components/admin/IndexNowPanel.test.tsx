import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import IndexNowPanel from "./IndexNowPanel"

const user = setupUser()

/** Mocks `fetch` with a JSON body, mirroring how the route replies. */
function mockFetch(
	payload: unknown,
	init: { status?: number } = {}
): ReturnType<typeof vi.fn> {
	const { status = 200 } = init
	const fetchMock = vi.fn().mockResolvedValue(
		new Response(JSON.stringify(payload), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	)
	global.fetch = fetchMock

	return fetchMock
}

function batch(status: number, message = "", errorName: string | null = null) {
	return { status, ok: status === 200 || status === 202, message, errorName }
}

const submitButton = () =>
	screen.getByRole("button", { name: /^submit all urls$/i })
const dryRunButton = () => screen.getByRole("button", { name: /^dry run$/i })

beforeEach(() => {
	vi.clearAllMocks()
	vi.spyOn(console, "warn").mockImplementation(() => {})
})

// #region submit

describe("IndexNowPanel submit", () => {
	it("posts without the dryRun flag and reports the accepted count", async () => {
		const fetchMock = mockFetch({
			ok: true,
			attempted: 3,
			accepted: 3,
			skipped: [],
			batches: [batch(200)],
		})
		render(<IndexNowPanel />)

		await user.click(submitButton())

		expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/indexnow")
		expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST")
		await waitFor(() =>
			expect(screen.getByText(/submitted 3 urls to indexnow/i)).toBeVisible()
		)
	})

	it("names both numbers when only some batches were accepted", async () => {
		// "Submitted 4 URLs" for a run where 2 landed is the failure this
		// distinction exists to prevent.
		mockFetch(
			{
				ok: false,
				attempted: 4,
				accepted: 2,
				skipped: [],
				batches: [batch(200), batch(403, "key not found")],
			},
			{ status: 502 }
		)
		render(<IndexNowPanel />)

		await user.click(submitButton())

		await waitFor(() =>
			expect(screen.getByText(/rejected the key \(403\)/i)).toBeVisible()
		)
	})

	it("singularises a one-URL submission", async () => {
		mockFetch({
			ok: true,
			attempted: 1,
			accepted: 1,
			skipped: [],
			batches: [batch(200)],
		})
		render(<IndexNowPanel />)

		await user.click(submitButton())

		await waitFor(() =>
			expect(screen.getByText(/submitted 1 url to indexnow/i)).toBeVisible()
		)
	})

	it("warns about off-host URLs the server skipped", async () => {
		mockFetch({
			ok: true,
			attempted: 1,
			accepted: 1,
			skipped: ["https://evil.com/x"],
			batches: [batch(200)],
		})
		render(<IndexNowPanel />)

		await user.click(submitButton())

		await waitFor(() =>
			expect(screen.getByText(/not on this host/i)).toBeVisible()
		)
		expect(screen.getByText(/evil\.com/)).toBeVisible()
	})
})

// #endregion

// #region failure reporting

describe("IndexNowPanel failures", () => {
	it.each([
		[403, /rejected the key \(403\)/i],
		[422, /rejected the urls \(422\)/i],
		[429, /rate-limited/i],
		[500, /indexnow returned 500/i],
	])("explains an upstream %s distinctly", async (status, expected) => {
		mockFetch(
			{
				ok: false,
				attempted: 1,
				accepted: 0,
				skipped: [],
				batches: [batch(status)],
			},
			{ status: 502 }
		)
		render(<IndexNowPanel />)

		await user.click(submitButton())

		await waitFor(() => expect(screen.getByText(expected)).toBeVisible())
	})

	it("distinguishes a timeout from an unreachable endpoint", async () => {
		mockFetch(
			{
				ok: false,
				attempted: 1,
				accepted: 0,
				skipped: [],
				batches: [batch(0, "timed out", "TimeoutError")],
			},
			{ status: 502 }
		)
		render(<IndexNowPanel />)

		await user.click(submitButton())

		await waitFor(() =>
			expect(screen.getByText(/did not respond in time/i)).toBeVisible()
		)
	})

	it("reports every distinct batch failure, not only the first", async () => {
		// Reporting the first reason alone hides a second, different cause.
		mockFetch(
			{
				ok: false,
				attempted: 4,
				accepted: 0,
				skipped: [],
				batches: [batch(403, "key not found"), batch(429)],
			},
			{ status: 502 }
		)
		render(<IndexNowPanel />)

		await user.click(submitButton())

		await waitFor(() =>
			expect(screen.getByText(/rejected the key \(403\)/i)).toBeVisible()
		)
		expect(screen.getByText(/rate-limited/i)).toBeVisible()
	})

	it("surfaces the excluded list a 422 carries instead of dropping it", async () => {
		// The route ships `skipped` on this failure; collapsing the body to one
		// string threw away exactly what tells the operator what went wrong.
		mockFetch(
			{
				error: "No submittable URLs for this host.",
				skipped: ["https://evil.com/x"],
			},
			{ status: 422 }
		)
		render(<IndexNowPanel />)

		await user.click(submitButton())

		await waitFor(() =>
			expect(screen.getByText(/no submittable urls/i)).toBeVisible()
		)
		expect(screen.getByText(/excluded \(off-host\)/i)).toBeVisible()
		expect(screen.getByText("https://evil.com/x")).toBeVisible()
	})

	it("shows the server's message for a config gap", async () => {
		mockFetch(
			{ error: "INDEXNOW_KEY is not configured for this deployment." },
			{ status: 503 }
		)
		render(<IndexNowPanel />)

		await user.click(submitButton())

		await waitFor(() =>
			expect(screen.getByText(/INDEXNOW_KEY is not configured/i)).toBeVisible()
		)
	})

	it("falls back to the status when the body is not JSON", async () => {
		// A proxy error page has no `error` field; the fallback must still name
		// the status rather than rendering an empty error.
		const fetchMock = vi.fn().mockResolvedValue(
			new Response("<html>gateway</html>", {
				status: 502,
				headers: { "Content-Type": "text/html" },
			})
		)
		global.fetch = fetchMock
		render(<IndexNowPanel />)

		await user.click(submitButton())

		await waitFor(() => expect(screen.getByText(/HTTP 502/i)).toBeVisible())
	})

	it("reports a network failure and re-enables the buttons", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("offline"))
		render(<IndexNowPanel />)

		await user.click(submitButton())

		await waitFor(() =>
			expect(screen.getByText(/network error/i)).toBeVisible()
		)
		expect(submitButton()).toBeEnabled()
	})
})

// #endregion

// #region dry run

describe("IndexNowPanel dry run", () => {
	it("sends the dryRun flag and lists both partitions without submitting", async () => {
		const fetchMock = mockFetch({
			dryRun: true,
			attempted: 1,
			urls: ["https://roland.leth.ro/a"],
			skipped: ["https://evil.com/x"],
			warnings: [],
		})
		render(<IndexNowPanel />)

		await user.click(dryRunButton())

		expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/indexnow?dryRun")
		await waitFor(() =>
			expect(
				screen.getByText(/dry run: 1 url would be submitted/i)
			).toBeVisible()
		)
		expect(screen.getByText("https://roland.leth.ro/a")).toBeVisible()
		expect(screen.getByText("https://evil.com/x")).toBeVisible()
	})

	it("renders the server's warnings", async () => {
		mockFetch({
			dryRun: true,
			attempted: 0,
			urls: [],
			skipped: [],
			warnings: [
				"INDEXNOW_KEY is not configured — a real submission will fail.",
			],
		})
		render(<IndexNowPanel />)

		await user.click(dryRunButton())

		await waitFor(() =>
			expect(screen.getByText(/a real submission will fail/i)).toBeVisible()
		)
	})

	it("does not treat a real-submit body as a successful dry run", async () => {
		// Success is action-specific: `ok` without `dryRun` means the server did
		// something other than what this button asked for.
		mockFetch({ ok: true, attempted: 1, accepted: 1, batches: [batch(200)] })
		render(<IndexNowPanel />)

		await user.click(dryRunButton())

		await waitFor(() => expect(screen.getByRole("alert")).toBeVisible())
		expect(screen.queryByText(/would be submitted/i)).not.toBeInTheDocument()
	})
})

// #endregion

// #region accessibility and busy state

describe("IndexNowPanel affordances", () => {
	it("exposes a live region before any request runs", async () => {
		// A region mounted together with its content is the update screen readers
		// miss, so it has to exist up front.
		render(<IndexNowPanel />)

		expect(screen.getByRole("status")).toBeInTheDocument()
	})

	it("ties each button to both the outcome and error regions", () => {
		// The failure headline is announced from the assertive error region, so
		// aria-controls names it alongside the polite outcome region — and both
		// regions must exist up front or the reference dangles.
		render(<IndexNowPanel />)

		for (const button of [submitButton(), dryRunButton()]) {
			expect(button).toHaveAttribute(
				"aria-controls",
				"indexnow-outcome indexnow-error"
			)
		}

		expect(document.getElementById("indexnow-outcome")).not.toBeNull()
		expect(document.getElementById("indexnow-error")).not.toBeNull()
	})

	it("announces the outcome through the live region", async () => {
		mockFetch({
			ok: true,
			attempted: 2,
			accepted: 2,
			skipped: [],
			batches: [batch(200)],
		})
		render(<IndexNowPanel />)

		await user.click(submitButton())

		await waitFor(() =>
			expect(screen.getByRole("status")).toHaveTextContent(
				/submitted 2 urls to indexnow/i
			)
		)
	})

	it("disables both buttons while a request is in flight", async () => {
		let release!: (value: Response) => void
		global.fetch = vi.fn().mockReturnValue(
			new Promise<Response>((resolve) => {
				release = resolve
			})
		)
		render(<IndexNowPanel />)

		await user.click(submitButton())

		// Both labels swap while pending, so query the in-flight names.
		const busy = await screen.findByRole("button", { name: /^submitting…$/i })
		const idle = screen.getByRole("button", { name: /^dry run$/i })

		expect(busy).toBeDisabled()
		expect(idle).toBeDisabled()
		expect(busy).toHaveAttribute("aria-busy", "true")
		expect(idle).toHaveAttribute("aria-busy", "false")

		release(
			new Response(
				JSON.stringify({
					ok: true,
					attempted: 1,
					accepted: 1,
					skipped: [],
					batches: [batch(200)],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } }
			)
		)

		await waitFor(() => expect(submitButton()).toBeEnabled())
	})

	it("keeps the URL lists reachable by keyboard", async () => {
		// The lists hold no focusable children, so without a tabIndex on the
		// scroll container their contents are unreachable past the visible rows.
		mockFetch({
			dryRun: true,
			attempted: 1,
			urls: ["https://roland.leth.ro/a"],
			skipped: [],
			warnings: [],
		})
		render(<IndexNowPanel />)

		await user.click(dryRunButton())

		await waitFor(() =>
			expect(
				screen.getByRole("group", { name: /to be submitted/i })
			).toHaveAttribute("tabindex", "0")
		)
	})
})

// #endregion
