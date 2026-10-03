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
import GuideForm from "./GuideForm"

const user = setupUser()

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

vi.mock("@/components/admin/MarkdownEditor", () => ({
	default: () => null,
}))

beforeEach(() => {
	vi.resetAllMocks()
	mockRouter()
})

// #region Description

describe("GuideForm — description", () => {
	it("counts against the shared cap, not a number of its own", () => {
		// The form hardcoded 160, so a change to `DESCRIPTION_MAX_CHARS` would have
		// left it behind with no error anywhere.
		render(<GuideForm topics={[]} projects={[]} />)

		expect(screen.getByText(`0/${DESCRIPTION_MAX_CHARS}`)).toBeInTheDocument()
	})

	it("requires a description", () => {
		render(<GuideForm topics={[]} projects={[]} />)

		expect(screen.getByLabelText(/description/i)).toBeRequired()
	})

	it("disables Save while the description is past the schema's cap", async () => {
		render(<GuideForm topics={[]} projects={[]} />)

		await user.click(screen.getByLabelText(/description/i))
		await user.paste("x".repeat(DESCRIPTION_MAX_CHARS + 1))

		expect(screen.getByRole("button", { name: /save guide/i })).toBeDisabled()
	})

	it("keeps Save enabled for a pasted description that fits once collapsed", async () => {
		render(<GuideForm topics={[]} projects={[]} />)

		await user.click(screen.getByLabelText(/description/i))
		await user.paste(`${"x".repeat(80)}\n\n\n${"x".repeat(79)}`)

		expect(screen.getByRole("button", { name: /save guide/i })).toBeEnabled()
	})
})

// #endregion

// #region Unsaved changes

describe("GuideForm — unsaved changes", () => {
	const initialData = {
		id: 5,
		slug: "choosing-well",
		title: "Choosing well",
		description: "How to choose.",
		body: "Body.",
		projectSlug: null,
		topicId: null,
		sortOrder: 2,
		published: true,
	}

	it("guards closing the tab only once something was typed", async () => {
		render(<GuideForm topics={[]} projects={[]} />)

		expect(isUnloadGuarded()).toBe(false)

		await user.type(screen.getByLabelText(/^title/i), "Choosing")

		expect(isUnloadGuarded()).toBe(true)
	})

	it("starts with no unsaved changes in edit mode", () => {
		render(<GuideForm initialData={initialData} topics={[]} projects={[]} />)

		expect(isUnloadGuarded()).toBe(false)
	})

	it("stops guarding once the save succeeds", async () => {
		mockFetchOk()
		render(<GuideForm initialData={initialData} topics={[]} projects={[]} />)

		await user.type(screen.getByLabelText(/^title/i), " again")

		expect(isUnloadGuarded()).toBe(true)

		await user.click(screen.getByRole("button", { name: /save guide/i }))

		await waitFor(() => expect(isUnloadGuarded()).toBe(false))
	})

	// The assertions are in `expectFailedSave`, which the lint rule can't see into.
	// eslint-disable-next-line sonarjs/assertions-in-tests
	it("shows the API's error and stays on the form, still guarded, when the save fails", async () => {
		const { push } = mockRouter()
		mockFetchError(409, { error: "Slug already taken" })
		render(<GuideForm initialData={initialData} topics={[]} projects={[]} />)

		await user.type(screen.getByLabelText(/^title/i), " again")
		await user.click(screen.getByRole("button", { name: /save guide/i }))

		await expectFailedSave({
			message: "Slug already taken (HTTP 409)",
			push,
			saveButton: /save guide/i,
		})
	})
})

// #endregion
