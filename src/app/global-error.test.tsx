import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import GlobalError from "./global-error"

const user = setupUser()

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("GlobalError", () => {
	it("renders the title", () => {
		render(<GlobalError error={new Error("boom")} reset={vi.fn()} />)

		expect(
			screen.getByRole("heading", { name: /something went wrong/i })
		).toBeInTheDocument()
	})

	it("invokes reset when the user clicks Try again", async () => {
		const reset = vi.fn()
		render(<GlobalError error={new Error("boom")} reset={reset} />)

		await user.click(screen.getByRole("button", { name: /try again/i }))

		expect(reset).toHaveBeenCalledTimes(1)
	})

	it("logs the error to the console for debugging", () => {
		const error = new Error("boom")
		render(<GlobalError error={error} reset={vi.fn()} />)

		expect(console.error).toHaveBeenCalledWith("[app:global-error]", error)
	})

	// Locks the dev-journal decision: the digest is intentionally not surfaced
	// without external error aggregation. Re-introduce paired with Sentry-or-equivalent.
	it("does not render the error digest", () => {
		const error = Object.assign(new Error("boom"), {
			digest: "abc123def456abcdef0123456789",
		})
		const { container } = render(<GlobalError error={error} reset={vi.fn()} />)

		expect(container.textContent).not.toContain(error.digest)
		expect(container.textContent).not.toMatch(/[a-f0-9]{8,}/)
	})
})
