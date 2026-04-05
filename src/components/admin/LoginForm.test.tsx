import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import LoginForm from "./LoginForm"

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

function mockFetch(ok: boolean, body: object = {}) {
	global.fetch = vi.fn().mockResolvedValue({
		ok,
		json: () => Promise.resolve(body),
	})
}

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
	it("navigates to /admin on a successful login", async () => {
		const { push } = mockRouter()
		mockFetch(true)

		render(<LoginForm />)
		await userEvent.type(screen.getByLabelText(/email/i), "admin@example.com")
		await userEvent.type(screen.getByLabelText(/password/i), "password")
		await userEvent.click(screen.getByRole("button", { name: /sign in/i }))

		await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"))
	})

	it("POSTs email and password to /api/auth/login", async () => {
		mockRouter()
		mockFetch(true)

		render(<LoginForm />)
		await userEvent.type(screen.getByLabelText(/email/i), "admin@example.com")
		await userEvent.type(screen.getByLabelText(/password/i), "secret")
		await userEvent.click(screen.getByRole("button", { name: /sign in/i }))

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
		await userEvent.type(screen.getByLabelText(/email/i), "admin@example.com")
		await userEvent.type(screen.getByLabelText(/password/i), "wrong")
		await userEvent.click(screen.getByRole("button", { name: /sign in/i }))

		await waitFor(() =>
			expect(screen.getByText("Invalid credentials")).toBeInTheDocument()
		)
	})

	it("shows a fallback error when the API response has no error field", async () => {
		mockRouter()
		mockFetch(false, {})

		render(<LoginForm />)
		await userEvent.type(screen.getByLabelText(/email/i), "admin@example.com")
		await userEvent.type(screen.getByLabelText(/password/i), "password")
		await userEvent.click(screen.getByRole("button", { name: /sign in/i }))

		await waitFor(() =>
			expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
		)
	})

	it("disables inputs and button while submitting", async () => {
		mockRouter()
		// Never resolve so we can inspect the in-flight state.
		global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

		render(<LoginForm />)
		await userEvent.type(screen.getByLabelText(/email/i), "admin@example.com")
		await userEvent.type(screen.getByLabelText(/password/i), "password")
		await userEvent.click(screen.getByRole("button", { name: /sign in/i }))

		expect(screen.getByLabelText(/email/i)).toBeDisabled()
		expect(screen.getByLabelText(/password/i)).toBeDisabled()
		expect(screen.getByRole("button")).toBeDisabled()
	})

	it("shows 'Signing in…' on the button while submitting", async () => {
		mockRouter()
		global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

		render(<LoginForm />)
		await userEvent.type(screen.getByLabelText(/email/i), "admin@example.com")
		await userEvent.type(screen.getByLabelText(/password/i), "password")
		await userEvent.click(screen.getByRole("button", { name: /sign in/i }))

		expect(screen.getByRole("button")).toHaveTextContent("Signing in…")
	})
})
