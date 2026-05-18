import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import PlatformPicker from "./PlatformPicker"

const user = setupUser()

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

// #region keyword toggle interactions

describe("PlatformPicker — keyword toggle interactions", () => {
	it("calls onChange with the keyword when a keyword is clicked", async () => {
		const onChange = vi.fn()
		render(<PlatformPicker value="" onChange={onChange} />)
		await user.click(screen.getByRole("button", { name: "iOS" }))
		expect(onChange).toHaveBeenCalledWith("iOS")
	})

	it("adds a second same-bucket keyword to the selection", async () => {
		const onChange = vi.fn()
		render(<PlatformPicker value="iOS" onChange={onChange} />)
		await user.click(screen.getByRole("button", { name: "iPad" }))
		expect(onChange).toHaveBeenCalledWith("iOS, iPad")
	})

	it("removes a keyword when it is clicked while already selected", async () => {
		const onChange = vi.fn()
		render(<PlatformPicker value="iOS" onChange={onChange} />)
		await user.click(screen.getByRole("button", { name: "iOS" }))
		expect(onChange).toHaveBeenCalledWith("")
	})

	it("locks keywords from other buckets after selecting a keyword", async () => {
		render(<PlatformPicker value="" onChange={vi.fn()} />)
		await user.click(screen.getByRole("button", { name: "iOS" }))
		expect(screen.getByRole("button", { name: "React" })).toBeDisabled()
	})
})

// #endregion

// #region freeform input interactions

describe("PlatformPicker — freeform input interactions", () => {
	it("calls onChange when the freeform input changes", async () => {
		const onChange = vi.fn()
		render(<PlatformPicker value="" onChange={onChange} />)
		await user.type(screen.getByPlaceholderText("or type freely…"), "x")
		expect(onChange).toHaveBeenCalledWith("x")
	})

	it("disables keyword buttons when freeform is non-empty", async () => {
		render(<PlatformPicker value="" onChange={vi.fn()} />)
		await user.type(screen.getByPlaceholderText("or type freely…"), "a")
		expect(screen.getByRole("button", { name: "iOS" })).toBeDisabled()
	})

	it("re-enables keyword buttons when freeform is cleared", async () => {
		render(<PlatformPicker value="" onChange={vi.fn()} />)
		const input = screen.getByPlaceholderText("or type freely…")
		await user.type(input, "a")
		await user.clear(input)
		expect(screen.getByRole("button", { name: "iOS" })).not.toBeDisabled()
	})
})

// #endregion
