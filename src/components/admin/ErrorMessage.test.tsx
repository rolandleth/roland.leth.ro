import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import ErrorMessage from "./ErrorMessage"

describe("ErrorMessage", () => {
	it("renders the message inside a role=alert paragraph", () => {
		render(<ErrorMessage>Save failed</ErrorMessage>)
		expect(screen.getByRole("alert")).toHaveTextContent("Save failed")
	})

	it("uses text-sm for the default md size", () => {
		render(<ErrorMessage>boom</ErrorMessage>)
		expect(screen.getByRole("alert")).toHaveClass("text-sm")
	})

	it("uses text-xs for size=sm (inline contexts)", () => {
		render(<ErrorMessage size="sm">boom</ErrorMessage>)
		expect(screen.getByRole("alert")).toHaveClass("text-xs")
	})

	it("appends caller-provided className alongside the size class", () => {
		render(
			<ErrorMessage size="sm" className="mx-auto max-w-4xl">
				boom
			</ErrorMessage>
		)
		const el = screen.getByRole("alert")
		expect(el).toHaveClass("text-xs", "mx-auto", "max-w-4xl", "text-red-500")
	})

	it("renders ReactNode children, not just strings", () => {
		render(
			<ErrorMessage>
				<strong>boom</strong>
			</ErrorMessage>
		)
		expect(screen.getByRole("alert").querySelector("strong")).toHaveTextContent(
			"boom"
		)
	})
})
