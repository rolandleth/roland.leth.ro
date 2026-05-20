import { render, screen, waitFor } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { setupUser } from "@/test/user"
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
// Stub the picker: in create mode there's no bucket selected, but the form's
// required-input gate would block submit. Auto-fill a valid `{ bucket, tags }`
// on mount so the form's invariant is satisfied without per-test interaction.
// Picker behavior is covered by its own dedicated tests.
function MockPlatformPicker({
	bucket,
	onChange,
}: {
	bucket: PlatformBucket | null
	tags: PlatformTag[]
	onChange: (v: { bucket: PlatformBucket | null; tags: PlatformTag[] }) => void
}) {
	useEffect(() => {
		if (bucket == null) {
			onChange({
				bucket: PlatformBucket.iOS,
				tags: [PlatformTag.iOS],
			})
		}
		// `onChange` identity changes every render in the real form, so
		// depending on it would re-fire forever. Only fire once on mount.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [bucket])

	return <div aria-label="Platform" />
}
vi.mock("@/components/admin/PlatformPicker", () => ({
	default: MockPlatformPicker,
}))
vi.mock("@/components/ui/PresetOrFreeformInput", () => ({
	default: ({
		id,
		value,
		onChange,
		presets,
		presetLabel,
	}: {
		id?: string
		value: string
		onChange: (v: string) => void
		presets: readonly string[]
		presetLabel?: string
	}) => (
		// `required` is intentionally not forwarded — the form's HTML validation
		// would block submit in edit mode (initialData.role="Developer" isn't in
		// presets, so the select value falls back to ""). The dedicated
		// PresetOrFreeformInput test file covers required-behavior.
		<select
			id={id}
			value={presets.includes(value) ? value : ""}
			onChange={(e) => onChange(e.target.value)}
		>
			<option value="">{presetLabel ?? "Select…"}</option>
			{presets.map((p) => (
				<option key={p} value={p}>
					{p}
				</option>
			))}
		</select>
	),
}))

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
	id: 3,
	name: "Existing App",
	summary: "An existing app.",
	bucket: PlatformBucket.Mac,
	platformTags: [PlatformTag.macOS],
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

const user = setupUser()

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Create mode (no initialData)

describe("ProjectForm — create mode", () => {
	it("renders the name input", () => {
		mockRouter()
		render(<ProjectForm />)
		expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument()
	})

	it("renders the platform picker", () => {
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
		await user.type(screen.getByLabelText(/^name$/i), "New App")
		await user.selectOptions(screen.getByLabelText(/^role$/i), "Sole developer")
		await user.type(screen.getByLabelText(/summary/i), "A new app.")
		await user.click(screen.getByRole("button", { name: /save project/i }))

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
		await user.type(screen.getByLabelText(/^name$/i), "New App")
		await user.selectOptions(screen.getByLabelText(/^role$/i), "Sole developer")
		await user.type(screen.getByLabelText(/summary/i), "A new app.")
		await user.click(screen.getByRole("button", { name: /save project/i }))

		await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"))
	})

	it("displays the error message from the API on failure", async () => {
		mockRouter()
		mockFetch(false, { error: "Name already taken" })

		render(<ProjectForm />)
		await user.type(screen.getByLabelText(/^name$/i), "New App")
		await user.selectOptions(screen.getByLabelText(/^role$/i), "Sole developer")
		await user.type(screen.getByLabelText(/summary/i), "A new app.")
		await user.click(screen.getByRole("button", { name: /save project/i }))

		await waitFor(() =>
			expect(screen.getByText(/Name already taken/)).toBeInTheDocument()
		)
	})

	it("shows 'Saving…' while the request is in-flight", async () => {
		mockRouter()
		global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

		render(<ProjectForm />)
		await user.type(screen.getByLabelText(/^name$/i), "New App")
		await user.selectOptions(screen.getByLabelText(/^role$/i), "Sole developer")
		await user.type(screen.getByLabelText(/summary/i), "A new app.")
		await user.click(screen.getByRole("button", { name: /save project/i }))

		expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument()
	})
})

// #endregion

// #region Edit mode (with initialData)

describe("ProjectForm — edit mode", () => {
	it("pre-fills the name field from initialData", () => {
		mockRouter()
		render(<ProjectForm initialData={initialData} />)
		expect(screen.getByLabelText<HTMLInputElement>(/^name$/i).value).toBe(
			"Existing App"
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
		await user.click(screen.getByRole("button", { name: /save project/i }))

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
		vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))

		render(<ProjectForm initialData={initialData} />)
		await user.click(screen.getByRole("button", { name: /delete/i }))

		await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"))
	})

	it("does not delete when the user cancels the confirm dialog", async () => {
		mockRouter()
		mockFetch(true)
		vi.stubGlobal("confirm", vi.fn().mockReturnValue(false))

		render(<ProjectForm initialData={initialData} />)
		await user.click(screen.getByRole("button", { name: /delete/i }))

		expect(global.fetch).not.toHaveBeenCalled()
	})
})

// #endregion

// #region sortOrder display state

describe("ProjectForm — sortOrder field", () => {
	it("commits a valid digit-only value to the payload", async () => {
		mockRouter()
		mockFetch(true)

		render(<ProjectForm initialData={initialData} />)
		const sortOrder = screen.getByLabelText<HTMLInputElement>(/sort order/i)
		await user.clear(sortOrder)
		await user.type(sortOrder, "5")
		await user.click(screen.getByRole("button", { name: /save project/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
		const payload = JSON.parse(options.body)
		expect(payload.sortOrder).toBe(5)
	})

	it("does not silently coerce invalid input to 0 (regression: empty + tab)", async () => {
		// Pre-fix: clearing the input committed sortOrder=0, erasing the prior
		// value. Now invalid input is held in the display until blur, then
		// snaps back to the last committed value, leaving state untouched.
		mockRouter()
		mockFetch(true)

		render(<ProjectForm initialData={initialData} />)
		const sortOrder = screen.getByLabelText<HTMLInputElement>(/sort order/i)
		await user.clear(sortOrder)
		// Tab away to trigger blur and snap-back.
		await user.tab()

		expect(sortOrder.value).toBe(String(initialData.sortOrder))

		await user.click(screen.getByRole("button", { name: /save project/i }))
		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
		const payload = JSON.parse(options.body)
		expect(payload.sortOrder).toBe(initialData.sortOrder)
	})

	it("submits the latest typed value when a digit-only edit precedes submit without blur", async () => {
		// Regression for the submit-before-blur race: user types `"5"` (commits
		// 5 via `onChange`), but the submit path must re-snap from
		// `sortOrderText` rather than trusting prior `state.sortOrder`. This
		// is the happy case — verifying the re-snap doesn't break the
		// already-committed value.
		mockRouter()
		mockFetch(true)

		render(<ProjectForm initialData={initialData} />)
		const sortOrder = screen.getByLabelText<HTMLInputElement>(/sort order/i)
		await user.clear(sortOrder)
		await user.type(sortOrder, "5")
		// No blur — go straight to submit.
		await user.click(screen.getByRole("button", { name: /save project/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
		const payload = JSON.parse(options.body)
		expect(payload.sortOrder).toBe(5)
	})

	it("does not submit a stale committed value when text is cleared without blur", async () => {
		// Regression for the submit-before-blur race: type `"5"` (commits 5),
		// then delete to `""` (no commit — `onChange` only writes state for
		// digit-only input). Pre-fix: submit shipped the stale `5`. Post-fix:
		// submit re-snaps from `sortOrderText` ("") and falls back to the
		// already-committed value (still 5 because the empty isn't valid).
		// Net effect either way is the user sees the snap-back in the input.
		mockRouter()
		mockFetch(true)

		render(<ProjectForm initialData={initialData} />)
		const sortOrder = screen.getByLabelText<HTMLInputElement>(/sort order/i)
		await user.clear(sortOrder)
		await user.type(sortOrder, "5")
		await user.clear(sortOrder)
		// No blur — go straight to submit while text is "".
		await user.click(screen.getByRole("button", { name: /save project/i }))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
		const payload = JSON.parse(options.body)
		// The submit re-snaps from `sortOrderText` (""); since that's not a
		// digit string, it falls back to `state.sortOrder` (still 5 from the
		// earlier valid edit). The visible input also snaps back to "5".
		expect(payload.sortOrder).toBe(5)
		expect(sortOrder.value).toBe("5")
	})
})

// #endregion
