import { render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { DESCRIPTION_MAX_CHARS } from "@/lib/content/descriptionRules"
import { setupUser } from "@/test/user"
import DescriptionField, { isDescriptionOverCap } from "./DescriptionField"

const user = setupUser()

/** 162 characters raw, exactly the cap once the line breaks collapse to a space. */
const PASTE_THAT_FITS = `${"x".repeat(80)}\n\n\n${"x".repeat(79)}`

/** The field is controlled, so a test needs a parent holding its value. */
function Harness({
	initialValue = "",
	isRequired,
}: {
	initialValue?: string
	isRequired?: boolean
}) {
	const [value, setValue] = useState(initialValue)

	return (
		<DescriptionField
			value={value}
			onChange={setValue}
			placeholder="Placeholder"
			isRequired={isRequired}
		/>
	)
}

function textarea(): HTMLTextAreaElement {
	return screen.getByLabelText<HTMLTextAreaElement>("Description")
}

// #region isDescriptionOverCap

describe("isDescriptionOverCap", () => {
	it("allows exactly the cap", () => {
		expect(isDescriptionOverCap("x".repeat(DESCRIPTION_MAX_CHARS))).toBe(false)
	})

	it("rejects one past the cap", () => {
		expect(isDescriptionOverCap("x".repeat(DESCRIPTION_MAX_CHARS + 1))).toBe(
			true
		)
	})

	it("measures after collapsing whitespace, as the schema does", () => {
		expect(PASTE_THAT_FITS.length).toBeGreaterThan(DESCRIPTION_MAX_CHARS)
		expect(isDescriptionOverCap(PASTE_THAT_FITS)).toBe(false)
	})

	it("doesn't count leading or trailing whitespace", () => {
		const padded = `  ${"x".repeat(DESCRIPTION_MAX_CHARS)}  `

		expect(isDescriptionOverCap(padded)).toBe(false)
	})
})

// #endregion

// #region DescriptionField

describe("DescriptionField", () => {
	it("sets no maxlength, which would count raw text", () => {
		render(<Harness />)

		expect(textarea()).not.toHaveAttribute("maxlength")
	})

	it("keeps a pasted paragraph whose collapsed form fits, uncut", async () => {
		// With `maxLength` the browser cut this paste to 160 raw characters, losing
		// text the schema would have accepted.
		render(<Harness />)

		await user.click(textarea())
		await user.paste(PASTE_THAT_FITS)

		expect(textarea().value).toBe(PASTE_THAT_FITS)
		expect(
			screen.getByText(`${DESCRIPTION_MAX_CHARS}/${DESCRIPTION_MAX_CHARS}`)
		).toBeInTheDocument()
		expect(textarea()).toHaveAttribute("aria-invalid", "false")
	})

	it("counts the collapsed length, the one that gets stored", async () => {
		render(<Harness />)

		await user.type(textarea(), "a\n\n  b")

		expect(screen.getByText(`3/${DESCRIPTION_MAX_CHARS}`)).toBeInTheDocument()
	})

	it("flags a value past the cap", () => {
		render(<Harness initialValue={"x".repeat(DESCRIPTION_MAX_CHARS + 1)} />)

		expect(textarea()).toHaveAttribute("aria-invalid", "true")
		expect(screen.getByText(/shorten it to save/)).toBeInTheDocument()
	})

	it("describes the textarea by its counter", () => {
		render(<Harness />)

		const counterId = textarea().getAttribute("aria-describedby")

		expect(counterId).not.toBeNull()
		expect(document.getElementById(counterId ?? "")).toHaveTextContent(
			`0/${DESCRIPTION_MAX_CHARS}`
		)
	})

	it("is optional unless the form requires it", () => {
		const { unmount } = render(<Harness />)
		expect(textarea()).not.toBeRequired()
		unmount()

		render(<Harness isRequired />)
		expect(textarea()).toBeRequired()
	})
})

// #endregion
