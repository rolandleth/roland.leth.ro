import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import LoanCalculatorClient from "./LoanCalculatorClient"

const user = setupUser()

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Comparison toggle

describe("LoanCalculatorClient comparison", () => {
	it("shows a single calculator by default", () => {
		render(<LoanCalculatorClient />)
		// Two calculators would render two instances of the "Loan" label.
		expect(screen.getAllByText("Loan")).toHaveLength(1)
	})

	it("adds a second calculator when 'Add comparison' is clicked", async () => {
		render(<LoanCalculatorClient />)
		await user.click(screen.getByRole("button", { name: /add comparison/i }))

		expect(screen.getAllByText("Loan")).toHaveLength(2)
		// Once comparing, the diff section renders with its own heading.
		expect(
			screen.getByText(/difference \(right vs left\)/i)
		).toBeInTheDocument()
	})

	it("removes the second calculator when 'Remove comparison' is clicked", async () => {
		render(<LoanCalculatorClient />)
		await user.click(screen.getByRole("button", { name: /add comparison/i }))
		await user.click(screen.getByRole("button", { name: /remove comparison/i }))

		expect(screen.getAllByText("Loan")).toHaveLength(1)
		expect(
			screen.queryByText(/difference \(right vs left\)/i)
		).not.toBeInTheDocument()
	})
})

// #endregion

// #region Extra-payments toggle

describe("LoanCalculatorClient extra payments", () => {
	it("hides the extra-payment sub-fields when the toggle is off (default)", () => {
		render(<LoanCalculatorClient />)
		// Sub-fields ("Value", "Frequency (months)", "Limit") only exist when toggled on.
		expect(screen.queryByText("Value")).not.toBeInTheDocument()
		expect(screen.queryByText("Frequency (months)")).not.toBeInTheDocument()
	})

	it("reveals the extra-payment sub-fields when the toggle is checked", async () => {
		render(<LoanCalculatorClient />)
		await user.click(screen.getByRole("checkbox"))

		expect(screen.getByText("Value")).toBeInTheDocument()
		expect(screen.getByText("Frequency (months)")).toBeInTheDocument()
		expect(screen.getByText("Limit")).toBeInTheDocument()
	})

	it("hides the sub-fields again when the toggle is cleared", async () => {
		// Toggling off also resets extraPayments state to zero internally; this
		// test locks the visible consequence (sub-fields hidden) since the reset
		// itself is internal to `Calculator`.
		render(<LoanCalculatorClient />)
		const toggle = screen.getByRole("checkbox")

		await user.click(toggle)
		expect(screen.getByText("Value")).toBeInTheDocument()

		await user.click(toggle)
		expect(screen.queryByText("Value")).not.toBeInTheDocument()
	})
})

// #endregion
