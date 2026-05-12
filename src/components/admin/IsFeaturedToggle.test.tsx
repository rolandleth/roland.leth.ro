import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import IsFeaturedToggle from "./IsFeaturedToggle"

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

function mockRouter() {
	const refresh = vi.fn()
	vi.mocked(useRouter).mockReturnValue({ refresh } as unknown as ReturnType<
		typeof useRouter
	>)
	return { refresh }
}

function mockFetchResolved(
	ok: boolean,
	{ status = ok ? 200 : 500, body }: { status?: number; body?: object } = {}
) {
	global.fetch = vi.fn().mockResolvedValue({
		ok,
		status,
		// `IsFeaturedToggle` now reads through the shared `readErrorMessage`,
		// which gates JSON parsing on the content-type header. Mirror reality.
		headers: {
			get: (name: string) =>
				name === "content-type" ? "application/json" : null,
		},
		json: () => Promise.resolve(body ?? {}),
	})
}

function mockFetchRejected(reason: unknown) {
	global.fetch = vi.fn().mockRejectedValue(reason)
}

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Rendering

describe("IsFeaturedToggle rendering", () => {
	it("renders a checkbox reflecting the initial value", () => {
		mockRouter()
		render(<IsFeaturedToggle projectId={1} initialIsFeatured={true} />)
		expect(screen.getByRole("checkbox")).toBeChecked()
	})

	it("renders an unchecked checkbox when initially not featured", () => {
		mockRouter()
		render(<IsFeaturedToggle projectId={1} initialIsFeatured={false} />)
		expect(screen.getByRole("checkbox")).not.toBeChecked()
	})
})

// #endregion

// #region Save behaviour

describe("IsFeaturedToggle save behaviour", () => {
	it("PUTs the new value to the project API on change", async () => {
		mockRouter()
		mockFetchResolved(true)

		render(<IsFeaturedToggle projectId={42} initialIsFeatured={false} />)
		await userEvent.click(screen.getByRole("checkbox"))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe("/api/admin/projects/42")
		expect(options.method).toBe("PUT")
		expect(JSON.parse(options.body)).toEqual({ isFeatured: true })
	})

	it("calls router.refresh on success", async () => {
		const { refresh } = mockRouter()
		mockFetchResolved(true)

		render(<IsFeaturedToggle projectId={1} initialIsFeatured={false} />)
		await userEvent.click(screen.getByRole("checkbox"))

		await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
	})

	it("reverts the checkbox and shows an error on non-ok response", async () => {
		mockRouter()
		mockFetchResolved(false)

		render(<IsFeaturedToggle projectId={1} initialIsFeatured={false} />)
		await userEvent.click(screen.getByRole("checkbox"))

		await waitFor(() =>
			expect(screen.getByText(/failed to save/i)).toBeInTheDocument()
		)
		expect(screen.getByRole("checkbox")).not.toBeChecked()
	})

	it("surfaces the server's error body with the HTTP status suffix on non-ok response", async () => {
		// Previously the toggle showed a generic "Failed to save" regardless of
		// the server's response — a 409 / 413 / 500 looked identical. Now the
		// server's `data.error` flows through `readErrorMessage` with the
		// `(HTTP NNN)` suffix appended, matching every other admin handler.
		mockRouter()
		mockFetchResolved(false, { status: 409, body: { error: "Project locked" } })

		render(<IsFeaturedToggle projectId={1} initialIsFeatured={false} />)
		await userEvent.click(screen.getByRole("checkbox"))

		await waitFor(() =>
			expect(screen.getByText("Project locked (HTTP 409)")).toBeInTheDocument()
		)
	})

	it("recovers from a thrown fetch rejection without getting stuck saving", async () => {
		// Previously the handler awaited `fetch` without try/catch, so a network
		// drop left `isSaving=true` forever — the checkbox stayed disabled with
		// no error feedback.
		mockRouter()
		mockFetchRejected(new Error("Network down"))

		render(<IsFeaturedToggle projectId={1} initialIsFeatured={false} />)
		await userEvent.click(screen.getByRole("checkbox"))

		// Surfaces the underlying error message (from `err.message`) rather
		// than a generic placeholder.
		await waitFor(() =>
			expect(screen.getByText(/network down/i)).toBeInTheDocument()
		)

		const checkbox = screen.getByRole("checkbox")
		expect(checkbox).not.toBeChecked()
		expect(checkbox).not.toBeDisabled()
	})

	it("aborts the in-flight request and reverts when toggled a second time before the first resolves", async () => {
		// Each handleChange call aborts the previous AbortController. If the abort
		// races a server commit the optimistic state should match the latest toggle,
		// not the first one. The key invariant is that isSaving clears and the
		// checkbox is not left disabled.
		mockRouter()
		let resolveFetch!: (value: { ok: boolean }) => void
		global.fetch = vi
			.fn()
			.mockImplementation(
				() => new Promise((resolve) => (resolveFetch = resolve))
			)

		render(<IsFeaturedToggle projectId={1} initialIsFeatured={false} />)
		await userEvent.click(screen.getByRole("checkbox"))

		// Second click while the first fetch is still pending.
		await userEvent.click(screen.getByRole("checkbox"))

		// Resolve the pending fetch (simulates the server responding after abort).
		resolveFetch({ ok: true })

		await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeDisabled())
	})
})

// #endregion
