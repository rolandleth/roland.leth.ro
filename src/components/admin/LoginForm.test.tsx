import { render, screen, waitFor } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import LoginForm from "./LoginForm"

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

function mockRouter() {
	const push = vi.fn()
	const refresh = vi.fn()
	vi.mocked(useRouter).mockReturnValue({
		push,
		refresh,
	} as unknown as ReturnType<typeof useRouter>)
	return { push, refresh }
}

function mockFetch(ok: boolean, body: object = {}, status?: number) {
	const resolvedStatus = status ?? (ok ? 200 : 401)
	global.fetch = vi.fn().mockResolvedValue({
		ok,
		status: resolvedStatus,
		headers: new Headers({ "content-type": "application/json" }),
		json: () => Promise.resolve(body),
	})
}

const user = setupUser()

beforeEach(() => {
	vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("LoginForm rendering", () => {
	it("renders the email input", () => {
		mockRouter()
		render(<LoginForm />)
		expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
	})

	it("renders the password input", () => {
		mockRouter()
		render(<LoginForm />)
		expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
	})

	it("renders the sign in button", () => {
		mockRouter()
		render(<LoginForm />)
		expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument()
	})

	it("does not render an error by default", () => {
		mockRouter()
		render(<LoginForm />)
		expect(screen.queryByRole("paragraph")).not.toBeInTheDocument()
	})
})

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

describe("LoginForm submission", () => {
	it("navigates to /admin and refreshes the RSC tree on a successful login", async () => {
		// `refresh()` is the load-bearing call: without it, the RSC tree can
		// briefly render unauthenticated state after the cookie is set but
		// before the next request rehydrates. Mirrors `useAdminResource`.
		const { push, refresh } = mockRouter()
		mockFetch(true)

		render(<LoginForm />)
		await user.type(screen.getByLabelText(/email/i), "admin@example.com")
		await user.type(screen.getByLabelText(/password/i), "password")
		await user.click(screen.getByRole("button", { name: /sign in/i }))

		await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"))
		expect(refresh).toHaveBeenCalledOnce()
	})

	it("POSTs email and password to /api/auth/login", async () => {
		mockRouter()
		mockFetch(true)

		render(<LoginForm />)
		await user.type(screen.getByLabelText(/email/i), "admin@example.com")
		await user.type(screen.getByLabelText(/password/i), "secret")
		await user.click(screen.getByRole("button", { name: /sign in/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())

		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe("/api/auth/login")
		expect(options.method).toBe("POST")

		const body = JSON.parse(options.body)
		expect(body.email).toBe("admin@example.com")
		expect(body.password).toBe("secret")
	})

	it("shows the error message returned by the API on failure", async () => {
		mockRouter()
		mockFetch(false, { error: "Invalid credentials" })

		render(<LoginForm />)
		await user.type(screen.getByLabelText(/email/i), "admin@example.com")
		await user.type(screen.getByLabelText(/password/i), "wrong")
		await user.click(screen.getByRole("button", { name: /sign in/i }))

		await waitFor(() =>
			expect(
				screen.getByText(/Invalid credentials \(HTTP 401\)/i)
			).toBeInTheDocument()
		)
	})

	it("shows a fallback error when the API response has no error field", async () => {
		mockRouter()
		mockFetch(false, {})

		render(<LoginForm />)
		await user.type(screen.getByLabelText(/email/i), "admin@example.com")
		await user.type(screen.getByLabelText(/password/i), "password")
		await user.click(screen.getByRole("button", { name: /sign in/i }))

		await waitFor(() =>
			expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
		)
	})

	it("disables inputs and button while submitting", async () => {
		mockRouter()
		// Never resolve so we can inspect the in-flight state.
		global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

		render(<LoginForm />)
		await user.type(screen.getByLabelText(/email/i), "admin@example.com")
		await user.type(screen.getByLabelText(/password/i), "password")
		await user.click(screen.getByRole("button", { name: /sign in/i }))

		expect(screen.getByLabelText(/email/i)).toBeDisabled()
		expect(screen.getByLabelText(/password/i)).toBeDisabled()
		expect(screen.getByRole("button")).toBeDisabled()
	})

	it("shows 'Signing in…' on the button while submitting", async () => {
		mockRouter()
		global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

		render(<LoginForm />)
		await user.type(screen.getByLabelText(/email/i), "admin@example.com")
		await user.type(screen.getByLabelText(/password/i), "password")
		await user.click(screen.getByRole("button", { name: /sign in/i }))

		expect(screen.getByRole("button")).toHaveTextContent("Signing in…")
	})

	it("logs a warn line and surfaces the fallback message on a network rejection", async () => {
		// Bare-catch previously dropped the cause; a flapping login had no
		// signal in logs. Tagged warn so the failure mode is debuggable.
		mockRouter()
		global.fetch = vi.fn().mockRejectedValue(new Error("network down"))

		render(<LoginForm />)
		await user.type(screen.getByLabelText(/email/i), "admin@example.com")
		await user.type(screen.getByLabelText(/password/i), "password")
		await user.click(screen.getByRole("button", { name: /sign in/i }))

		await waitFor(() =>
			expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
		)
		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[admin:LoginForm] submit failed",
			expect.any(Error)
		)
	})

	it("aborts the in-flight request on unmount", async () => {
		mockRouter()
		// Capture the AbortSignal handed to fetch so we can assert it aborts.
		let capturedSignal: AbortSignal | undefined
		global.fetch = vi.fn().mockImplementation((_url, options) => {
			capturedSignal = options.signal
			return new Promise(() => {})
		})

		const { unmount } = render(<LoginForm />)
		await user.type(screen.getByLabelText(/email/i), "admin@example.com")
		await user.type(screen.getByLabelText(/password/i), "password")
		await user.click(screen.getByRole("button", { name: /sign in/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		expect(capturedSignal?.aborted).toBe(false)

		unmount()

		expect(capturedSignal?.aborted).toBe(true)
	})
})
