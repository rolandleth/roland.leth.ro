import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AdminNav from "./AdminNav"

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

describe("AdminNav — handleLogout", () => {
	it("redirects to /admin/login on a successful logout", async () => {
		const { push } = mockRouter()
		global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })

		render(<AdminNav />)
		await userEvent.click(screen.getByRole("button", { name: /logout/i }))

		await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/login"))
	})

	it("blocks the redirect and surfaces an error on a non-ok response", async () => {
		// Pre-fix bug: a 401/500 logout silently redirected to /admin/login while
		// the session cookie may still be alive on the server. Now: error shown,
		// no redirect, user can retry.
		const { push } = mockRouter()
		global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

		render(<AdminNav />)
		await userEvent.click(screen.getByRole("button", { name: /logout/i }))

		await waitFor(() =>
			expect(screen.getByRole("alert")).toHaveTextContent(/HTTP 500/)
		)
		expect(push).not.toHaveBeenCalled()
	})

	it("blocks the redirect and surfaces an error on a network failure", async () => {
		const { push } = mockRouter()
		global.fetch = vi.fn().mockRejectedValue(new Error("Network down"))

		render(<AdminNav />)
		await userEvent.click(screen.getByRole("button", { name: /logout/i }))

		await waitFor(() =>
			expect(screen.getByRole("alert")).toHaveTextContent(/network error/i)
		)
		expect(push).not.toHaveBeenCalled()
	})

	it("re-enables the logout button after a failed attempt so the user can retry", async () => {
		mockRouter()
		global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

		render(<AdminNav />)
		const button = screen.getByRole("button", { name: /logout/i })
		await userEvent.click(button)

		await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument())
		expect(button).not.toBeDisabled()
	})

	it("logs a warn line on a network rejection (so a flapping logout is debuggable)", async () => {
		mockRouter()
		global.fetch = vi.fn().mockRejectedValue(new Error("Network down"))

		render(<AdminNav />)
		await userEvent.click(screen.getByRole("button", { name: /logout/i }))

		await waitFor(() =>
			expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
				"[admin:AdminNav] logout failed",
				expect.any(Error)
			)
		)
	})

	it("aborts the in-flight logout on unmount", async () => {
		mockRouter()
		let capturedSignal: AbortSignal | undefined
		global.fetch = vi.fn().mockImplementation((_url, options) => {
			capturedSignal = options.signal
			return new Promise(() => {})
		})

		const { unmount } = render(<AdminNav />)
		await userEvent.click(screen.getByRole("button", { name: /logout/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		expect(capturedSignal?.aborted).toBe(false)

		unmount()

		expect(capturedSignal?.aborted).toBe(true)
	})
})
