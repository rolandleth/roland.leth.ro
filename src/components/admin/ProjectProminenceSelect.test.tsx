import { render, screen, waitFor } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DISCONTINUED_PLACEMENT_HINT } from "@/components/admin/projectPlacement"
import { ProjectProminence, ProjectStatus } from "@/generated/prisma/enums"
import { setupUser } from "@/test/user"
import ProjectProminenceSelect from "./ProjectProminenceSelect"

const user = setupUser()

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

function mockFetchResolved(
	ok: boolean,
	{ status = ok ? 200 : 500, body }: { status?: number; body?: object } = {}
) {
	global.fetch = vi.fn().mockResolvedValue({
		ok,
		status,
		headers: {
			get: (name: string) =>
				name === "content-type" ? "application/json" : null,
		},
		json: () => Promise.resolve(body ?? {}),
	})
}

function renderPicker({
	projectId = 1,
	initial = ProjectProminence.low,
	status = ProjectStatus.live,
}: {
	projectId?: number
	initial?: ProjectProminence
	status?: ProjectStatus
} = {}) {
	return render(
		<ProjectProminenceSelect
			projectId={projectId}
			initial={initial}
			status={status}
		/>
	)
}

function picker(): HTMLSelectElement {
	return screen.getByRole("combobox", { name: "Prominence" })
}

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Rendering

describe("ProjectProminenceSelect rendering", () => {
	it("shows the stored level, offering every level by name", () => {
		mockRouter()
		renderPicker({ initial: ProjectProminence.medium })

		expect(picker()).toHaveValue(ProjectProminence.medium)
		expect(
			Array.from(picker().options, (option) => option.textContent)
		).toEqual(["High", "Medium", "Low"])
	})
})

// #endregion

// #region Discontinued hint

describe("ProjectProminenceSelect discontinued hint", () => {
	it.each([ProjectProminence.high, ProjectProminence.medium])(
		"says a discontinued project at %s shows under More projects, and links it to the picker",
		(initial) => {
			mockRouter()
			renderPicker({ initial, status: ProjectStatus.discontinued })

			expect(picker()).toHaveAccessibleDescription(DISCONTINUED_PLACEMENT_HINT)
		}
	)

	// Low already lands under More projects: there's nothing to override.
	it("stays quiet for a discontinued project at low", () => {
		mockRouter()
		renderPicker({
			initial: ProjectProminence.low,
			status: ProjectStatus.discontinued,
		})

		expect(screen.queryByText(DISCONTINUED_PLACEMENT_HINT)).toBeNull()
		expect(picker()).not.toHaveAttribute("aria-describedby")
	})

	// A coming-soon project lands where its level says, as a live one does.
	it.each([ProjectStatus.live, ProjectStatus.comingSoon])(
		"stays quiet for a %s project at a high level",
		(status) => {
			mockRouter()
			renderPicker({ initial: ProjectProminence.high, status })

			expect(screen.queryByText(DISCONTINUED_PLACEMENT_HINT)).toBeNull()
		}
	)

	it("shows as soon as a discontinued project is moved off low, before the save returns", async () => {
		mockRouter()
		global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))
		renderPicker({
			initial: ProjectProminence.low,
			status: ProjectStatus.discontinued,
		})

		await user.selectOptions(picker(), ProjectProminence.high)

		expect(screen.getByText(DISCONTINUED_PLACEMENT_HINT)).toBeInTheDocument()
	})
})

// #endregion

// #region Save behaviour

describe("ProjectProminenceSelect save behaviour", () => {
	it("PUTs the prominence alone to the project's URL, then refreshes", async () => {
		const { refresh } = mockRouter()
		mockFetchResolved(true)

		renderPicker({ projectId: 7 })
		await user.selectOptions(picker(), ProjectProminence.high)

		await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
		const [url, options] = vi.mocked(global.fetch).mock.calls[0]
		expect(url).toBe("/api/admin/projects/7")
		expect(options?.method).toBe("PUT")
		expect(JSON.parse(String(options?.body))).toEqual({
			prominence: ProjectProminence.high,
		})
	})

	it("disables the picker while a save is in flight", async () => {
		mockRouter()
		let resolveFetch!: (value: {
			ok: boolean
			status: number
			headers: { get: () => null }
			json: () => Promise<object>
		}) => void
		global.fetch = vi
			.fn()
			.mockImplementation(
				() => new Promise((resolve) => (resolveFetch = resolve))
			)

		renderPicker()
		await user.selectOptions(picker(), ProjectProminence.medium)

		expect(picker()).toBeDisabled()

		resolveFetch({
			ok: true,
			status: 200,
			headers: { get: () => null },
			json: () => Promise.resolve({}),
		})

		await waitFor(() => expect(picker()).not.toBeDisabled())
	})

	it("reverts to the level it changed away from and shows the server's error", async () => {
		const { refresh } = mockRouter()
		mockFetchResolved(false, { status: 400, body: { error: "Invalid input" } })

		renderPicker({ initial: ProjectProminence.medium })
		await user.selectOptions(picker(), ProjectProminence.high)

		await waitFor(() =>
			expect(screen.getByText("Invalid input (HTTP 400)")).toBeInTheDocument()
		)
		expect(picker()).toHaveValue(ProjectProminence.medium)
		expect(refresh).not.toHaveBeenCalled()
	})

	it("recovers from a thrown fetch rejection without getting stuck saving", async () => {
		mockRouter()
		global.fetch = vi.fn().mockRejectedValue(new Error("Network down"))

		renderPicker()
		await user.selectOptions(picker(), ProjectProminence.high)

		await waitFor(() =>
			expect(screen.getByText(/network down/i)).toBeInTheDocument()
		)
		expect(picker()).toHaveValue(ProjectProminence.low)
		expect(picker()).not.toBeDisabled()
	})
})

// #endregion
