import { render, screen, waitFor } from "@testing-library/react"
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

		await waitFor(() =>
			expect(screen.getByText(/failed to save/i)).toBeInTheDocument()
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
