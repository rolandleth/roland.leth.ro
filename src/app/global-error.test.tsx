import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import GlobalError from "./global-error"

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

		await userEvent.click(screen.getByRole("button", { name: /try again/i }))

		expect(reset).toHaveBeenCalledTimes(1)
	})

	it("logs the error to the console for debugging", () => {
		const error = new Error("boom")
		render(<GlobalError error={error} reset={vi.fn()} />)

		expect(console.error).toHaveBeenCalledWith("[app:global-error]", error)
	})
})
