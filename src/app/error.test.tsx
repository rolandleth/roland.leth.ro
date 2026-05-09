import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import InlineError from "./error"

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("InlineError", () => {
	it("renders the title and the back-home link", () => {
		render(<InlineError error={new Error("boom")} reset={vi.fn()} />)

		expect(
			screen.getByRole("heading", { name: /something went wrong/i })
		).toBeInTheDocument()
		expect(screen.getByRole("link", { name: /back home/i })).toHaveAttribute(
			"href",
			"/"
		)
	})

	it("invokes reset when the user clicks Try again", async () => {
		const reset = vi.fn()
		render(<InlineError error={new Error("boom")} reset={reset} />)

		await userEvent.click(screen.getByRole("button", { name: /try again/i }))

		expect(reset).toHaveBeenCalledTimes(1)
	})

	it("logs the error to the console for debugging", () => {
		const error = new Error("boom")
		render(<InlineError error={error} reset={vi.fn()} />)

		expect(console.error).toHaveBeenCalledWith("[app:error]", error)
	})
})
