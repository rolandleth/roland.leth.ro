import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SLUG_MAX_LENGTH } from "@/lib/utils/format"
import { setupUser } from "@/test/user"
import SlugField from "./SlugField"

const user = setupUser()

describe("SlugField", () => {
	it("is a required field with the canonical pattern when editable", () => {
		render(<SlugField value="" onChange={vi.fn()} hint="Hint." />)
		const input = screen.getByLabelText("Slug")

		expect(input).toBeRequired()
		expect(input).toHaveAttribute("maxLength", String(SLUG_MAX_LENGTH))
		expect(input).not.toHaveAttribute("readonly")
	})

	it("flags a slug that isn't canonical as invalid", () => {
		render(<SlugField value="My App" onChange={vi.fn()} hint="Hint." />)

		expect(screen.getByLabelText("Slug")).toBeInvalid()
	})

	it("accepts a canonical slug", () => {
		render(<SlugField value="my-app" onChange={vi.fn()} hint="Hint." />)

		expect(screen.getByLabelText("Slug")).toBeValid()
	})

	it("reports each edit", async () => {
		const onChange = vi.fn()
		render(<SlugField value="" onChange={onChange} hint="Hint." />)

		await user.type(screen.getByLabelText("Slug"), "a")

		expect(onChange).toHaveBeenCalledWith("a")
	})

	it("is read-only and exempt from validation when locked", () => {
		// A legacy slug that predates the canonical rule must never block a save.
		render(<SlugField value="Legacy_Slug" hint="Hint." isLocked />)
		const input = screen.getByLabelText("Slug")

		expect(input).toHaveAttribute("readonly")
		expect(input).not.toBeRequired()
		expect(input).toBeValid()
	})

	it("describes the field with its hint", () => {
		render(<SlugField value="" onChange={vi.fn()} hint="Fixed after save." />)

		expect(screen.getByLabelText("Slug")).toHaveAccessibleDescription(
			"Fixed after save."
		)
	})
})
