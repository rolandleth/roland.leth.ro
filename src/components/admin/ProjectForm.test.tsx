import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ProjectForm from "./ProjectForm"

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

// Stub sub-components that are not the focus of these tests.
vi.mock("@/components/admin/ImageUpload", () => ({
	default: () => null,
}))
vi.mock("@/components/admin/SectionManager", () => ({
	default: () => null,
}))
vi.mock("@/components/admin/LinkManager", () => ({
	default: () => null,
}))

function mockRouter() {
	const push = vi.fn()
	vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<
		typeof useRouter
	>)
	return { push }
}

function mockFetch(ok: boolean, body: object = {}) {
	global.fetch = vi.fn().mockResolvedValue({
		ok,
		json: () => Promise.resolve(body),
	})
}

const initialData = {
	id: 3,
	name: "Existing App",
	summary: "An existing app.",
	platform: "macOS",
	role: "Developer",
	accentColor: "#6366f1",
	icon: null,
	heroImage: null,
	isFeatured: true,
	isDiscontinued: false,
	date: "2023",
	sortOrder: 1,
	sections: [],
	links: [],
}

beforeEach(() => {
	vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// Create mode (no initialData)
// ---------------------------------------------------------------------------

describe("ProjectForm — create mode", () => {
	it("renders the name input", () => {
		mockRouter()
		render(<ProjectForm />)
		expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument()
	})

	it("renders the platform input", () => {
		mockRouter()
		render(<ProjectForm />)
		expect(screen.getByLabelText(/platform/i)).toBeInTheDocument()
	})

	it("renders the summary textarea", () => {
		mockRouter()
		render(<ProjectForm />)
		expect(screen.getByLabelText(/summary/i)).toBeInTheDocument()
	})

	it("renders the featured and discontinued checkboxes", () => {
		mockRouter()
		render(<ProjectForm />)
		const checkboxes = screen.getAllByRole("checkbox")
		expect(checkboxes).toHaveLength(2)
	})

	it("does not show a delete button in create mode", () => {
		mockRouter()
		render(<ProjectForm />)
		expect(
			screen.queryByRole("button", { name: /delete/i })
		).not.toBeInTheDocument()
	})

	it("sends a POST request to /api/admin/projects on submit", async () => {
		mockRouter()
		mockFetch(true)

		render(<ProjectForm />)
		await userEvent.type(screen.getByLabelText(/^name$/i), "New App")
		await userEvent.type(screen.getByLabelText(/platform/i), "iOS")
		await userEvent.type(screen.getByLabelText(/summary/i), "A new app.")
		await userEvent.click(screen.getByRole("button", { name: /save project/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe("/api/admin/projects")
		expect(options.method).toBe("POST")
	})

	it("navigates to /admin after a successful save", async () => {
		const { push } = mockRouter()
		mockFetch(true)

		render(<ProjectForm />)
		await userEvent.type(screen.getByLabelText(/^name$/i), "New App")
		await userEvent.type(screen.getByLabelText(/platform/i), "iOS")
		await userEvent.type(screen.getByLabelText(/summary/i), "A new app.")
		await userEvent.click(screen.getByRole("button", { name: /save project/i }))

		await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"))
	})

	it("displays the error message from the API on failure", async () => {
		mockRouter()
		mockFetch(false, { error: "Name already taken" })

		render(<ProjectForm />)
		await userEvent.type(screen.getByLabelText(/^name$/i), "New App")
		await userEvent.type(screen.getByLabelText(/platform/i), "iOS")
		await userEvent.type(screen.getByLabelText(/summary/i), "A new app.")
		await userEvent.click(screen.getByRole("button", { name: /save project/i }))

		await waitFor(() =>
			expect(screen.getByText("Name already taken")).toBeInTheDocument()
		)
	})

	it("shows 'Saving…' while the request is in-flight", async () => {
		mockRouter()
		global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

		render(<ProjectForm />)
		await userEvent.type(screen.getByLabelText(/^name$/i), "New App")
		await userEvent.type(screen.getByLabelText(/platform/i), "iOS")
		await userEvent.type(screen.getByLabelText(/summary/i), "A new app.")
		await userEvent.click(screen.getByRole("button", { name: /save project/i }))

		expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument()
	})
})

// ---------------------------------------------------------------------------
// Edit mode (with initialData)
// ---------------------------------------------------------------------------

describe("ProjectForm — edit mode", () => {
	it("pre-fills the name field from initialData", () => {
		mockRouter()
		render(<ProjectForm initialData={initialData} />)
		expect(screen.getByLabelText<HTMLInputElement>(/^name$/i).value).toBe(
			"Existing App"
		)
	})

	it("pre-fills the platform field from initialData", () => {
		mockRouter()
		render(<ProjectForm initialData={initialData} />)
		expect(screen.getByLabelText<HTMLInputElement>(/platform/i).value).toBe(
			"macOS"
		)
	})

	it("checks the Featured checkbox when isFeatured is true", () => {
		mockRouter()
		render(<ProjectForm initialData={initialData} />)
		const [featuredCheckbox] = screen.getAllByRole("checkbox")
		expect(featuredCheckbox).toBeChecked()
	})

	it("shows the delete button in edit mode", () => {
		mockRouter()
		render(<ProjectForm initialData={initialData} />)
		expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument()
	})

	it("sends a PUT request to /api/admin/projects/:id on submit", async () => {
		mockRouter()
		mockFetch(true)

		render(<ProjectForm initialData={initialData} />)
		await userEvent.click(screen.getByRole("button", { name: /save project/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe(`/api/admin/projects/${initialData.id}`)
		expect(options.method).toBe("PUT")
	})

	it("navigates to /admin after a successful delete", async () => {
		const { push } = mockRouter()
		// DELETE returns 204 (no body), ok=true
		global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 })
		vi.spyOn(window, "confirm").mockReturnValue(true)

		render(<ProjectForm initialData={initialData} />)
		await userEvent.click(screen.getByRole("button", { name: /delete/i }))

		await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"))
	})

	it("does not delete when the user cancels the confirm dialog", async () => {
		mockRouter()
		mockFetch(true)
		vi.spyOn(window, "confirm").mockReturnValue(false)

		render(<ProjectForm initialData={initialData} />)
		await userEvent.click(screen.getByRole("button", { name: /delete/i }))

		expect(global.fetch).not.toHaveBeenCalled()
	})
})
