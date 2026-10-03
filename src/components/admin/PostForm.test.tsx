import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DESCRIPTION_MAX_CHARS } from "@/lib/content/descriptionRules"
import { expectFailedSave } from "@/test/adminForms"
import {
	mockFetchError,
	mockFetchOk,
	mockRouter,
} from "@/test/mocks/adminRequests"
import { isUnloadGuarded } from "@/test/unsavedChanges"
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
// A plain input stands in for the upload widget, so a test can edit the URL
// without the upload machinery.
// The extra button lets a test drive `onUploadingChange` without the upload
// machinery, since that is what gates Save.
vi.mock("@/components/admin/ImageUpload", () => ({
	default: ({
		value,
		onChange,
		label,
		onUploadingChange,
	}: {
		value: string
		onChange: (value: string) => void
		label: string
		onUploadingChange?: (isUploading: boolean) => void
	}) => (
		<>
			<input
				aria-label={label}
				value={value}
				onChange={(event) => onChange(event.target.value)}
			/>
			<button type="button" onClick={() => onUploadingChange?.(true)}>
				Start upload
			</button>
		</>
	),
}))

// Freeze currentDatetimeString so datetime field has a predictable default.
vi.mock("@/lib/utils/format", async (importOriginal) => {
	const mod = await importOriginal<typeof import("@/lib/utils/format")>()
	return { ...mod, currentDatetimeString: vi.fn(() => "2025-01-01-1200") }
})

const initialData = {
	id: 7,
	title: "Existing Title",
	slug: "existing-title",
	body: "Existing body.",
	section: "life",
	datetime: "2024-06-01-0900",
	description: "A short description.",
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

	it("guards closing the tab only once something was typed", async () => {
		mockRouter()
		render(<PostForm />)

		expect(isUnloadGuarded()).toBe(false)

		await user.type(screen.getByLabelText(/title/i), "Draft")

		expect(isUnloadGuarded()).toBe(true)
	})

	it("guards closing the tab while an upload is in flight", async () => {
		// The upload's URL reaches the form state only when it lands.
		mockRouter()
		render(<PostForm />)

		await user.click(screen.getByRole("button", { name: /start upload/i }))

		expect(isUnloadGuarded()).toBe(true)
	})

	it("stops guarding once the save succeeds, while the list loads", async () => {
		// The edits are stored; a tab close before the list renders must not
		// warn about them.
		mockRouter()
		mockFetchOk()
		render(<PostForm />)

		await user.type(screen.getByLabelText(/title/i), "A new post")
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(isUnloadGuarded()).toBe(false))
	})

	// The assertions are in `expectFailedSave`, which the lint rule can't see into.
	// eslint-disable-next-line sonarjs/assertions-in-tests
	it("shows the API's error and stays on the form, still guarded, when the save fails", async () => {
		const { push } = mockRouter()
		mockFetchError(400, { error: "Validation error" })
		render(<PostForm />)

		await user.type(screen.getByLabelText(/title/i), "A new post")
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await expectFailedSave({
			message: "Validation error (HTTP 400)",
			push,
			saveButton: /save post/i,
		})
	})

	it("sends a POST request to /api/admin/posts on submit", async () => {
		mockRouter()
		mockFetchOk()

		render(<PostForm />)
		await user.type(screen.getByLabelText(/title/i), "A new post")
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe("/api/admin/posts")
		expect(options.method).toBe("POST")
	})

	it("fills the slug from the title and sends it", async () => {
		mockRouter()
		mockFetchOk()

		render(<PostForm />)
		await user.type(screen.getByLabelText(/title/i), "A new post")

		expect(screen.getByLabelText("Slug")).toHaveValue("a-new-post")

		await user.click(screen.getByRole("button", { name: /save post/i }))
		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
		expect(JSON.parse(options.body).slug).toBe("a-new-post")
	})

	it("keeps a typed slug when the title changes afterwards", async () => {
		mockRouter()
		render(<PostForm />)
		const title = screen.getByLabelText(/title/i)
		const slug = screen.getByLabelText("Slug")

		await user.type(title, "Weekly links")
		await user.clear(slug)
		await user.type(slug, "weekly-links-42")
		await user.type(title, " #42")

		expect(slug).toHaveValue("weekly-links-42")
	})

	it("leaves the slug empty and required for a title with no letters or digits", async () => {
		// An all-CJK title used to fail on Save with a message about
		// punctuation; now the author types the slug instead.
		mockRouter()
		render(<PostForm />)

		await user.type(screen.getByLabelText(/title/i), "日本語")

		const slug = screen.getByLabelText("Slug")
		expect(slug).toHaveValue("")
		expect(slug).toBeRequired()
	})

	it("navigates to /admin after a successful save", async () => {
		const { push } = mockRouter()
		mockFetchOk()

		render(<PostForm />)
		await user.type(screen.getByLabelText(/title/i), "New post")
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"))
	})

	it("shows 'Saving…' while the request is in-flight", async () => {
		mockRouter()
		global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

		render(<PostForm />)
		await user.type(screen.getByLabelText(/title/i), "New post")
		await user.click(screen.getByRole("button", { name: /save post/i }))

		expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument()
	})

	it("sends an empty description and a null image when neither is filled in", async () => {
		mockRouter()
		mockFetchOk()

		render(<PostForm />)
		await user.type(screen.getByLabelText(/title/i), "A new post")
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]

		// `""` is "derive one", not "leave the column"; `null` is a cleared image.
		expect(JSON.parse(options.body)).toMatchObject({
			description: "",
			imageUrl: null,
		})
	})

	it("sends an image URL that was set in the widget", async () => {
		mockRouter()
		mockFetchOk()

		render(<PostForm />)
		await user.type(screen.getByLabelText(/title/i), "A new post")
		await user.type(
			screen.getByLabelText("Image"),
			"https://example.com/cover.png"
		)
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]

		expect(JSON.parse(options.body).imageUrl).toBe(
			"https://example.com/cover.png"
		)
	})

	it("disables Save while the description is past the schema's cap", async () => {
		// The save would only come back as a 400.
		mockRouter()
		render(<PostForm />)

		await user.click(screen.getByLabelText(/description/i))
		await user.paste("x".repeat(DESCRIPTION_MAX_CHARS + 1))

		expect(screen.getByRole("button", { name: /save post/i })).toBeDisabled()
	})

	it("keeps Save enabled for a pasted description that fits once collapsed", async () => {
		// 162 raw characters, 160 stored. The schema collapses before it measures,
		// so the gate has to as well.
		mockRouter()
		render(<PostForm />)

		await user.click(screen.getByLabelText(/description/i))
		await user.paste(`${"x".repeat(80)}\n\n\n${"x".repeat(79)}`)

		expect(screen.getByRole("button", { name: /save post/i })).toBeEnabled()
	})

	it("disables Save while an image is uploading", async () => {
		// Saving mid-upload persisted the row without the image and navigated
		// away, aborting the request: the picked file was lost with nothing shown.
		mockRouter()
		mockFetchOk()

		render(<PostForm />)
		await user.click(screen.getByRole("button", { name: /start upload/i }))

		expect(screen.getByRole("button", { name: /save post/i })).toBeDisabled()
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

	it("starts with no unsaved changes", () => {
		mockRouter()
		render(<PostForm initialData={initialData} />)

		expect(isUnloadGuarded()).toBe(false)
	})

	it("sends a PUT request to /api/admin/posts/:id on submit", async () => {
		mockRouter()
		mockFetchOk()

		render(<PostForm initialData={initialData} />)
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe(`/api/admin/posts/${initialData.id}`)
		expect(options.method).toBe("PUT")
	})

	it("shows the slug read-only and leaves it alone when the title changes", async () => {
		mockRouter()
		render(<PostForm initialData={initialData} />)
		const slug = screen.getByLabelText("Slug")

		await user.type(screen.getByLabelText(/title/i), " v2")

		expect(slug).toHaveAttribute("readonly")
		expect(slug).toHaveValue("existing-title")
	})

	it("does not send a slug on update", async () => {
		mockRouter()
		mockFetchOk()

		render(<PostForm initialData={initialData} />)
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
		expect(JSON.parse(options.body)).not.toHaveProperty("slug")
	})

	it("sends the description back as loaded when it isn't edited", async () => {
		// The route counts an unchanged description as untouched, so an authored
		// one survives a body edit.
		mockRouter()
		mockFetchOk()

		render(<PostForm initialData={initialData} />)
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
		expect(JSON.parse(options.body).description).toBe("A short description.")
	})

	it("sends a removed image as null, so the route clears it", async () => {
		// An omitted key is skipped by the edit route, which left the old image on
		// the post.
		mockRouter()
		mockFetchOk()

		render(
			<PostForm
				initialData={{ ...initialData, imageUrl: "https://example.com/a.png" }}
			/>
		)
		await user.clear(screen.getByLabelText(/^image$/i))
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
		expect(JSON.parse(options.body)).toHaveProperty("imageUrl", null)
	})

	it("sends null for a post with no image", async () => {
		mockRouter()
		mockFetchOk()

		render(<PostForm initialData={{ ...initialData, imageUrl: null }} />)
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
		expect(JSON.parse(options.body)).toHaveProperty("imageUrl", null)
	})

	it("sends an emptied description as an empty string, which the route derives from", async () => {
		// Omitting the key would read as "not sent" and keep the old description.
		mockRouter()
		mockFetchOk()

		render(<PostForm initialData={initialData} />)
		await user.clear(screen.getByLabelText(/description/i))
		await user.click(screen.getByRole("button", { name: /save post/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
		expect(JSON.parse(options.body)).toHaveProperty("description", "")
	})

	it("navigates to /admin after a successful delete", async () => {
		const { push } = mockRouter()
		mockFetchOk()
		vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))

		render(<PostForm initialData={initialData} />)
		await user.click(screen.getByRole("button", { name: /delete/i }))

		await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"))
	})

	it("does not delete when the user cancels the confirm dialog", async () => {
		mockRouter()
		mockFetchOk()
		vi.stubGlobal("confirm", vi.fn().mockReturnValue(false))

		render(<PostForm initialData={initialData} />)
		await user.click(screen.getByRole("button", { name: /delete/i }))

		expect(global.fetch).not.toHaveBeenCalled()
	})
})

// #endregion
