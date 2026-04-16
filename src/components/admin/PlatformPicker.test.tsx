import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import PlatformPicker from "./PlatformPicker"

// #region cross-bucket initial value

describe("PlatformPicker — cross-bucket initial value", () => {
	it("renders the value as freeform when keywords span multiple buckets", () => {
		render(<PlatformPicker value="iOS, React" onChange={vi.fn()} />)
		expect(screen.getByPlaceholderText("or type freely…")).toHaveValue(
			"iOS, React"
		)
	})

	it("leaves the freeform input editable (not disabled by a keyword selection)", () => {
		render(<PlatformPicker value="iOS, React" onChange={vi.fn()} />)
		expect(screen.getByPlaceholderText("or type freely…")).not.toBeDisabled()
	})
})

// #endregion

// #region same-bucket initial value

describe("PlatformPicker — same-bucket initial value", () => {
	it("selects keywords and disables the freeform input when all keywords are in one bucket", () => {
		render(<PlatformPicker value="iOS, iPad" onChange={vi.fn()} />)
		const freeform = screen.getByPlaceholderText("or type freely…")
		expect(freeform).toHaveValue("")
		expect(freeform).toBeDisabled()
	})

	it("locks out keywords from other buckets when one bucket is active", () => {
		render(<PlatformPicker value="iOS, iPad" onChange={vi.fn()} />)
		expect(screen.getByRole("button", { name: "React" })).toBeDisabled()
	})
})

// #endregion
