import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import PresetOrFreeformInput from "./PresetOrFreeformInput"

const user = setupUser()

const PRESETS = ["Apple", "Banana", "Cherry"] as const

// #region initial render

describe("PresetOrFreeformInput — initial render", () => {
	it("enables both inputs when value is empty", () => {
		render(
			<PresetOrFreeformInput value="" onChange={vi.fn()} presets={PRESETS} />
		)
		expect(screen.getByRole("combobox")).not.toBeDisabled()
		expect(screen.getByPlaceholderText("or type freely…")).not.toBeDisabled()
	})

	it("shows the preset in the dropdown and disables the text input when value matches a preset", () => {
		render(
			<PresetOrFreeformInput
				value="Apple"
				onChange={vi.fn()}
				presets={PRESETS}
			/>
		)
		expect(screen.getByRole("combobox")).toHaveValue("Apple")
		expect(screen.getByPlaceholderText("or type freely…")).toBeDisabled()
	})

	it("shows the freeform value and disables the dropdown when value is not a preset", () => {
		render(
			<PresetOrFreeformInput
				value="Durian"
				onChange={vi.fn()}
				presets={PRESETS}
			/>
		)
		expect(screen.getByRole("combobox")).toBeDisabled()
		expect(screen.getByPlaceholderText("or type freely…")).toHaveValue("Durian")
	})
})

// #endregion

// #region prop sync

describe("PresetOrFreeformInput — prop sync", () => {
	it("re-derives mode when the value prop transitions preset → freeform", () => {
		const { rerender } = render(
			<PresetOrFreeformInput
				value="Apple"
				onChange={vi.fn()}
				presets={PRESETS}
			/>
		)
		rerender(
			<PresetOrFreeformInput
				value="Durian"
				onChange={vi.fn()}
				presets={PRESETS}
			/>
		)
		// No stale "Apple" in the dropdown, input now owns "Durian" and is enabled.
		expect(screen.getByRole("combobox")).toBeDisabled()
		expect(screen.getByPlaceholderText("or type freely…")).toHaveValue("Durian")
	})

	it("re-derives mode when the value prop transitions freeform → preset", () => {
		const { rerender } = render(
			<PresetOrFreeformInput
				value="Durian"
				onChange={vi.fn()}
				presets={PRESETS}
			/>
		)
		rerender(
			<PresetOrFreeformInput
				value="Apple"
				onChange={vi.fn()}
				presets={PRESETS}
			/>
		)
		expect(screen.getByRole("combobox")).toHaveValue("Apple")
		expect(screen.getByPlaceholderText("or type freely…")).toBeDisabled()
		expect(screen.getByPlaceholderText("or type freely…")).toHaveValue("")
	})
})

// #endregion

// #region interactions

describe("PresetOrFreeformInput — interactions", () => {
	it("calls onChange with the preset when one is selected", async () => {
		const onChange = vi.fn()
		render(
			<PresetOrFreeformInput value="" onChange={onChange} presets={PRESETS} />
		)
		await user.selectOptions(screen.getByRole("combobox"), "Banana")
		expect(onChange).toHaveBeenCalledWith("Banana")
	})

	it("calls onChange with empty when the Freeform… option is selected", async () => {
		const onChange = vi.fn()
		render(
			<PresetOrFreeformInput
				value="Apple"
				onChange={onChange}
				presets={PRESETS}
			/>
		)
		await user.selectOptions(screen.getByRole("combobox"), "Freeform…")
		expect(onChange).toHaveBeenCalledWith("")
	})

	it("calls onChange with the typed value from the freeform input", async () => {
		const onChange = vi.fn()
		render(
			<PresetOrFreeformInput value="" onChange={onChange} presets={PRESETS} />
		)
		await user.type(screen.getByPlaceholderText("or type freely…"), "x")
		expect(onChange).toHaveBeenCalledWith("x")
	})

	it("always renders the Freeform… option so preset mode can return to freeform", () => {
		render(
			<PresetOrFreeformInput
				value="Apple"
				onChange={vi.fn()}
				presets={PRESETS}
			/>
		)
		expect(
			screen.getByRole("option", { name: "Freeform…" })
		).toBeInTheDocument()
	})
})

// #endregion

// #region required

describe("PresetOrFreeformInput — required", () => {
	it("marks the dropdown as required when not in freeform mode", () => {
		render(
			<PresetOrFreeformInput
				value=""
				onChange={vi.fn()}
				presets={PRESETS}
				required
			/>
		)
		expect(screen.getByRole("combobox")).toBeRequired()
	})

	it("marks the freeform input as required when not in preset mode", () => {
		render(
			<PresetOrFreeformInput
				value=""
				onChange={vi.fn()}
				presets={PRESETS}
				required
			/>
		)
		expect(screen.getByPlaceholderText("or type freely…")).toBeRequired()
	})

	it("drops the required flag from the dropdown once a freeform value is set", () => {
		render(
			<PresetOrFreeformInput
				value="Durian"
				onChange={vi.fn()}
				presets={PRESETS}
				required
			/>
		)
		expect(screen.getByRole("combobox")).not.toBeRequired()
	})

	it("drops the required flag from the freeform input once a preset is selected", () => {
		render(
			<PresetOrFreeformInput
				value="Apple"
				onChange={vi.fn()}
				presets={PRESETS}
				required
			/>
		)
		expect(screen.getByPlaceholderText("or type freely…")).not.toBeRequired()
	})
})

// #endregion
