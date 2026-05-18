import { render, screen, waitFor } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import PostForm from "./PostForm"

const user = setupUser()

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

// Stub heavy sub-components that are not the focus of these tests.
vi.mock("@/components/admin/MarkdownEditor", () => ({
	default: () => null,
}))
vi.mock("@/components/admin/ImageUpload", () => ({
	default: () => null,
}))

// Freeze currentDatetimeString so datetime field has a predictable default.
vi.mock("@/lib/utils/format", async (importOriginal) => {
	const mod = await importOriginal<typeof import("@/lib/utils/format")>()
	return { ...mod, currentDatetimeString: vi.fn(() => "2025-01-01-1200") }
})

function mockRouter() {
	const push = vi.fn()
	const refresh = vi.fn()
	vi.mocked(useRouter).mockReturnValue({
		push,
		refresh,
	} as unknown as ReturnType<typeof useRouter>)
	return { push, refresh }
}

function mockFetch(ok: boolean, body: object = {}) {
	// `useAdminResource.readErrorMessage` inspects the `content-type` header
	// before parsing the body, so a bare `{ok, json}` object isn't enough.
	global.fetch = vi.fn().mockResolvedValue({
		ok,
		headers: new Headers({ "content-type": "application/json" }),
		json: () => Promise.resolve(body),
	})
}

const initialData = {
	id: 7,
	title: "Existing Title",
	body: "Existing body.",
	section: "life",
	datetime: "2024-06-01-0900",
	summary: "A short summary.",
	imageUrl: null,
	published: false,
}

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Create mode (no initialData)

describe("PostForm — create mode", () => {
	it("renders the title input", () => {
		mockRouter()
		render(<PostForm />)
		expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
	})

	it("renders the section select", () => {
		mockRouter()
		render(<PostForm />)
		expect(screen.getByLabelText(/section/i)).toBeInTheDocument()
	})

	it("renders the published checkbox", () => {
		mockRouter()
		render(<PostForm />)
		expect(screen.getByRole("checkbox")).toBeInTheDocument()
	})

	it("does not show a delete button in create mode", () => {
		mockRouter()
		render(<PostForm />)
		expect(
			screen.queryByRole("button", { name: /delete/i })
		).not.toBeInTheDocument()
	})

	it("sends a POST request to /api/admin/posts on submit", async () => {
		mockRouter()
		mockFetch(true)

		render(<PostForm />)
		await user.type(screen.getByLabelText(/title/i), "A new post")
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe("/api/admin/posts")
		expect(options.method).toBe("POST")
	})

	it("navigates to /admin after a successful save", async () => {
		const { push } = mockRouter()
		mockFetch(true)

		render(<PostForm />)
		await user.type(screen.getByLabelText(/title/i), "New post")
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"))
	})

	it("displays the error message returned by the API on failure", async () => {
		mockRouter()
		mockFetch(false, { error: "Validation error" })

		render(<PostForm />)
		await user.type(screen.getByLabelText(/title/i), "New post")
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() =>
			expect(screen.getByText(/Validation error/)).toBeInTheDocument()
		)
	})

	it("shows 'Saving…' while the request is in-flight", async () => {
		mockRouter()
		global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

		render(<PostForm />)
		await user.type(screen.getByLabelText(/title/i), "New post")
		await user.click(screen.getByRole("button", { name: /save post/i }))

		expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument()
	})
})

// #endregion

// #region Edit mode (with initialData)

describe("PostForm — edit mode", () => {
	it("pre-fills the title field from initialData", () => {
		mockRouter()
		render(<PostForm initialData={initialData} />)
		expect(screen.getByLabelText<HTMLInputElement>(/title/i).value).toBe(
			"Existing Title"
		)
	})

	it("pre-selects the section from initialData", () => {
		mockRouter()
		render(<PostForm initialData={initialData} />)
		expect(screen.getByLabelText<HTMLSelectElement>(/section/i).value).toBe(
			"life"
		)
	})

	it("shows the delete button in edit mode", () => {
		mockRouter()
		render(<PostForm initialData={initialData} />)
		expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument()
	})

	it("sends a PUT request to /api/admin/posts/:id on submit", async () => {
		mockRouter()
		mockFetch(true)

		render(<PostForm initialData={initialData} />)
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe(`/api/admin/posts/${initialData.id}`)
		expect(options.method).toBe("PUT")
	})

	it("navigates to /admin after a successful delete", async () => {
		const { push } = mockRouter()
		mockFetch(true)
		vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))

		render(<PostForm initialData={initialData} />)
		await user.click(screen.getByRole("button", { name: /delete/i }))

		await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"))
	})

	it("does not delete when the user cancels the confirm dialog", async () => {
		mockRouter()
		mockFetch(true)
		vi.stubGlobal("confirm", vi.fn().mockReturnValue(false))

		render(<PostForm initialData={initialData} />)
		await user.click(screen.getByRole("button", { name: /delete/i }))

		expect(global.fetch).not.toHaveBeenCalled()
	})
})

// #endregion
