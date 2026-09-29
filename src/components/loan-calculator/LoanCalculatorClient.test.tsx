import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	MAX_ANNUAL_INTEREST_RATE,
	MAX_PERIOD_MONTHS,
} from "@/lib/utils/loanCalculator"
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

	it("opens the comparison calculator's extra payments when it copies some", async () => {
		render(<LoanCalculatorClient />)
		await user.click(screen.getByRole("checkbox"))
		await replaceValue(field("Value"), "1000")

		await user.click(screen.getByRole("button", { name: /add comparison/i }))

		const toggles = screen.getAllByRole("checkbox")
		expect(toggles).toHaveLength(2)
		expect(toggles[1]).toBeChecked()
		const valueFields = screen.getAllByRole("spinbutton", { name: "Value" })
		expect(valueFields).toHaveLength(2)
		expect(valueFields[1]).toHaveValue(1000)
	})

	it("keeps the comparison calculator's extra payments closed when there are none", async () => {
		render(<LoanCalculatorClient />)
		await user.click(screen.getByRole("button", { name: /add comparison/i }))

		for (const toggle of screen.getAllByRole("checkbox")) {
			expect(toggle).not.toBeChecked()
		}
	})
})

// #endregion

// #region Input validation

function field(name: string): HTMLInputElement {
	return screen.getByRole("spinbutton", { name })
}

function summaryValue(label: string): string | null {
	return screen.getByText(label).nextElementSibling?.textContent ?? null
}

async function replaceValue(input: HTMLInputElement, text: string) {
	await user.clear(input)

	if (text !== "") {
		await user.type(input, text)
	}
}

describe("LoanCalculatorClient input validation", () => {
	it("shows an error instead of crashing when Duration is 0", async () => {
		render(<LoanCalculatorClient />)
		const before = summaryValue("Monthly rate")

		await replaceValue(field("Duration (months)"), "0")

		expect(screen.getByText("Use 1 or more.")).toBeInTheDocument()
		expect(field("Duration (months)")).toHaveAttribute("aria-invalid", "true")
		expect(summaryValue("Monthly rate")).toBe(before)
	})

	it("shows an error for a negative interest rate", async () => {
		render(<LoanCalculatorClient />)
		const before = summaryValue("Monthly rate")

		await replaceValue(field("Annual interest rate (%)"), "-1")

		expect(screen.getByText("Use 0 or more.")).toBeInTheDocument()
		expect(summaryValue("Monthly rate")).toBe(before)
	})

	it("shows an error for a Duration past the maximum instead of running it", async () => {
		render(<LoanCalculatorClient />)
		const duration = field("Duration (months)")
		// Typing is per keystroke, so the results follow the last value that
		// was still in range ("999") and stop there.
		await replaceValue(duration, "999")
		const atLastValid = summaryValue("Monthly rate")

		await user.type(duration, "9999999")

		expect(
			screen.getByText(`Use ${MAX_PERIOD_MONTHS} or less.`)
		).toBeInTheDocument()
		expect(summaryValue("Monthly rate")).toBe(atLastValid)
	})

	it("shows an error for an interest rate past the maximum", async () => {
		render(<LoanCalculatorClient />)
		const rate = field("Annual interest rate (%)")
		await replaceValue(rate, "10")
		const atLastValid = summaryValue("Monthly rate")

		await user.type(rate, "1")

		expect(
			screen.getByText(`Use ${MAX_ANNUAL_INTEREST_RATE} or less.`)
		).toBeInTheDocument()
		expect(summaryValue("Monthly rate")).toBe(atLastValid)
	})

	it("adds the error to the field's accessible description", async () => {
		render(<LoanCalculatorClient />)
		const duration = field("Duration (months)")

		await replaceValue(duration, "0")

		expect(duration).toHaveAccessibleDescription(
			expect.stringContaining("Use 1 or more.")
		)
	})

	it("announces the error through a live region", async () => {
		render(<LoanCalculatorClient />)
		const duration = field("Duration (months)")

		await replaceValue(duration, "0")

		expect(screen.getByText("Use 1 or more.")).toHaveAttribute(
			"aria-live",
			"polite"
		)
	})

	it("mounts the live region, empty, before any error appears", async () => {
		// A live region announces only changes to content it already held, so
		// one mounted together with its error would stay silent.
		const { container } = render(<LoanCalculatorClient />)
		const regionsBefore = [
			...container.querySelectorAll<HTMLElement>('[aria-live="polite"]'),
		]

		expect(regionsBefore.length).toBeGreaterThan(0)
		expect(regionsBefore.every((region) => region.textContent === "")).toBe(
			true
		)

		await replaceValue(field("Duration (months)"), "0")

		expect(regionsBefore).toContain(screen.getByText("Use 1 or more."))
	})

	it("empties the live region and drops it from the description once valid again", async () => {
		render(<LoanCalculatorClient />)
		const duration = field("Duration (months)")

		await replaceValue(duration, "0")
		const region = screen.getByText("Use 1 or more.")

		// An empty id would match any list, and a substring check would match an
		// id that merely starts with this one; compare whole tokens instead.
		expect(region.id).not.toBe("")
		expect(describedByIds(duration)).toContain(region.id)

		await replaceValue(duration, "120")

		expect(region).toBeInTheDocument()
		expect(region).toBeEmptyDOMElement()
		expect(describedByIds(duration)).not.toContain(region.id)
	})

	/** The ids in an element's `aria-describedby`, as whole tokens. */
	function describedByIds(element: HTMLElement): string[] {
		return (element.getAttribute("aria-describedby") ?? "")
			.split(/\s+/)
			.filter((id) => id !== "")
	}

	it("keeps the invalid-border and spin-button utilities as separate classes", () => {
		render(<LoanCalculatorClient />)

		// jsdom compiles no Tailwind, so this guards the class tokens themselves:
		// two utilities fused without a space generate neither rule.
		expect(field("Duration (months)").classList).toContain(
			"aria-[invalid=true]:border-red-500"
		)
		expect(field("Duration (months)").classList).toContain(
			"[&::-webkit-inner-spin-button]:appearance-none"
		)
	})

	it("shows an error for a fractional Duration", async () => {
		render(<LoanCalculatorClient />)

		await replaceValue(field("Duration (months)"), "12.5")

		expect(screen.getByText("Use a whole number.")).toBeInTheDocument()
	})

	it("lets a field stay empty while retyping, with an error", async () => {
		render(<LoanCalculatorClient />)

		await replaceValue(field("Loan"), "")

		expect(field("Loan")).toHaveValue(null)
		expect(screen.getByText("Enter a number.")).toBeInTheDocument()
	})

	it("shows an error for an extra-payment frequency of 0", async () => {
		render(<LoanCalculatorClient />)
		await user.click(screen.getByRole("checkbox"))

		await replaceValue(field("Frequency (months)"), "0")

		expect(screen.getByText("Use 1 or more.")).toBeInTheDocument()
	})

	it("clears the error and recomputes once the value is valid again", async () => {
		render(<LoanCalculatorClient />)
		const before = summaryValue("Monthly rate")
		const duration = field("Duration (months)")

		await replaceValue(duration, "0")
		await replaceValue(duration, "120")

		expect(screen.queryByText("Use 1 or more.")).not.toBeInTheDocument()
		expect(duration).toHaveAttribute("aria-invalid", "false")
		expect(summaryValue("Monthly rate")).not.toBe(before)
	})

	it("copies the last valid value into a comparison opened while a field is invalid", async () => {
		render(<LoanCalculatorClient />)
		await replaceValue(field("Duration (months)"), "120")
		await user.type(field("Duration (months)"), ".5")

		await user.click(screen.getByRole("button", { name: /add comparison/i }))

		const [first, second] = screen.getAllByRole("spinbutton", {
			name: "Duration (months)",
		})
		// The draft stays where it was typed; the copy starts from the params
		// the results were computed from, so it opens valid.
		expect(first).toHaveValue(120.5)
		expect(first).toHaveAttribute("aria-invalid", "true")
		expect(second).toHaveValue(120)
		expect(second).toHaveAttribute("aria-invalid", "false")
	})

	it("resets a hidden extra-payment field when the toggle is turned off", async () => {
		render(<LoanCalculatorClient />)
		const toggle = screen.getByRole("checkbox")
		await user.click(toggle)
		await replaceValue(field("Frequency (months)"), "0")

		await user.click(toggle)
		await user.click(toggle)

		expect(field("Frequency (months)")).toHaveValue(1)
		expect(screen.queryByText("Use 1 or more.")).not.toBeInTheDocument()
	})
})

// #endregion
