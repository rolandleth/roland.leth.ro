import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ProjectSortOrderInput from "./ProjectSortOrderInput"

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

function mockRouter() {
	const refresh = vi.fn()
	vi.mocked(useRouter).mockReturnValue({ refresh } as unknown as ReturnType<
		typeof useRouter
	>)
	return { refresh }
}

function mockFetchResolved(ok: boolean) {
	global.fetch = vi.fn().mockResolvedValue({ ok })
}

function mockFetchRejected(reason: unknown) {
	global.fetch = vi.fn().mockRejectedValue(reason)
}

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Display translation

describe("ProjectSortOrderInput display translation", () => {
	it("renders the DB 0-indexed sortOrder as a 1-indexed display value", () => {
		mockRouter()
		render(
			<ProjectSortOrderInput
				projectId={1}
				initialSortOrder={0}
				totalCount={5}
			/>
		)
		expect(screen.getByRole("spinbutton")).toHaveValue(1)
	})

	it("translates sortOrder=4 to display value 5", () => {
		mockRouter()
		render(
			<ProjectSortOrderInput
				projectId={1}
				initialSortOrder={4}
				totalCount={5}
			/>
		)
		expect(screen.getByRole("spinbutton")).toHaveValue(5)
	})
})

// #endregion

// #region Save behaviour

describe("ProjectSortOrderInput save behaviour", () => {
	it("PUTs a 0-indexed sortOrder on blur after a valid change", async () => {
		mockRouter()
		mockFetchResolved(true)

		render(
			<ProjectSortOrderInput
				projectId={42}
				initialSortOrder={0}
				totalCount={5}
			/>
		)
		const input = screen.getByRole("spinbutton")
		await userEvent.clear(input)
		await userEvent.type(input, "3")
		await userEvent.tab()

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe("/api/admin/projects/42")
		expect(options.method).toBe("PUT")
		expect(JSON.parse(options.body)).toEqual({ sortOrder: 2 })
	})

	it("does not PUT when the value is unchanged", async () => {
		mockRouter()
		mockFetchResolved(true)

		render(
			<ProjectSortOrderInput
				projectId={1}
				initialSortOrder={2}
				totalCount={5}
			/>
		)
		await userEvent.click(screen.getByRole("spinbutton"))
		await userEvent.tab()

		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("resets to the initial value on an empty/NaN input", async () => {
		mockRouter()
		mockFetchResolved(true)

		render(
			<ProjectSortOrderInput
				projectId={1}
				initialSortOrder={2}
				totalCount={5}
			/>
		)
		const input = screen.getByRole("spinbutton")
		await userEvent.clear(input)
		await userEvent.tab()

		expect(input).toHaveValue(3)
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("recovers from a thrown fetch rejection without getting stuck saving", async () => {
		// Previously the handler awaited `fetch` without try/catch, so a network
		// drop left `isSaving=true` forever and disabled the input silently.
		mockRouter()
		mockFetchRejected(new Error("Network down"))

		render(
			<ProjectSortOrderInput
				projectId={1}
				initialSortOrder={0}
				totalCount={5}
			/>
		)
		const input = screen.getByRole("spinbutton")
		await userEvent.clear(input)
		await userEvent.type(input, "3")
		await userEvent.tab()

		// The catch now surfaces err.message so the failure reason is visible
		// without opening DevTools (e.g. "Network down" instead of "Failed to save").
		await waitFor(() =>
			expect(screen.getByText(/network down/i)).toBeInTheDocument()
		)
		expect(input).toHaveValue(1)
		expect(input).not.toBeDisabled()
	})

	it("clamps display value to totalCount on input above the cap", async () => {
		// Pinning the upper-bound clamp so future regressions don't let the
		// admin send an out-of-range sortOrder past the API.
		mockRouter()
		mockFetchResolved(true)

		render(
			<ProjectSortOrderInput
				projectId={1}
				initialSortOrder={0}
				totalCount={5}
			/>
		)
		const input = screen.getByRole("spinbutton")
		await userEvent.clear(input)
		await userEvent.type(input, "999")
		await userEvent.tab()

		expect(input).toHaveValue(5)
	})

	it("clamps display value to 1 on input below the floor", async () => {
		mockRouter()
		mockFetchResolved(true)

		render(
			<ProjectSortOrderInput
				projectId={1}
				initialSortOrder={2}
				totalCount={5}
			/>
		)
		const input = screen.getByRole("spinbutton")
		await userEvent.clear(input)
		await userEvent.type(input, "0")
		await userEvent.tab()

		expect(input).toHaveValue(1)
	})
})

// #endregion

// #region Strict digit-only parse (Phase 6 peer fix)

describe("ProjectSortOrderInput strict digit parse", () => {
	// The blur handler previously used `parseInt(value, 10)`, which silently
	// accepted trailing garbage (`"3abc" → 3`) and decimals (`"3.7" → 3`). The
	// peer `ProjectForm.sortOrder` was tightened in Phase 6 but this per-row
	// input was missed. Now: any non-`/^\d+$/` input snaps back to the SSR
	// value without firing a PUT. Tests use `fireEvent.change` because
	// `userEvent.type` on `type="number"` strips non-numeric characters at the
	// DOM layer, which would short-circuit the contract under test.

	function setValue(input: HTMLElement, raw: string) {
		fireEvent.change(input, { target: { value: raw } })
	}

	it("rejects '3.7' (decimal) and resets to the initial value without firing a PUT", async () => {
		mockRouter()
		mockFetchResolved(true)

		render(
			<ProjectSortOrderInput
				projectId={1}
				initialSortOrder={2}
				totalCount={5}
			/>
		)
		const input = screen.getByRole("spinbutton")
		setValue(input, "3.7")
		fireEvent.blur(input)

		expect(input).toHaveValue(3)
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("rejects '3abc' (trailing garbage) and resets without firing a PUT", async () => {
		mockRouter()
		mockFetchResolved(true)

		render(
			<ProjectSortOrderInput
				projectId={1}
				initialSortOrder={2}
				totalCount={5}
			/>
		)
		const input = screen.getByRole("spinbutton")
		setValue(input, "3abc")
		fireEvent.blur(input)

		expect(input).toHaveValue(3)
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("rejects '-5' (negative) and resets without firing a PUT", async () => {
		mockRouter()
		mockFetchResolved(true)

		render(
			<ProjectSortOrderInput
				projectId={1}
				initialSortOrder={2}
				totalCount={5}
			/>
		)
		const input = screen.getByRole("spinbutton")
		setValue(input, "-5")
		fireEvent.blur(input)

		expect(input).toHaveValue(3)
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("accepts a plain integer string and PUTs the 0-indexed value", async () => {
		mockRouter()
		mockFetchResolved(true)

		render(
			<ProjectSortOrderInput
				projectId={1}
				initialSortOrder={0}
				totalCount={5}
			/>
		)
		const input = screen.getByRole("spinbutton")
		setValue(input, "4")
		fireEvent.blur(input)

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const options = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
		expect(JSON.parse(options.body)).toEqual({ sortOrder: 3 })
	})
})

// #endregion
