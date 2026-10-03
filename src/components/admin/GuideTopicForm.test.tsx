import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { expectFailedSave } from "@/test/adminForms"
import {
	mockFetchError,
	mockFetchOk,
	mockRouter,
} from "@/test/mocks/adminRequests"
import { isUnloadGuarded } from "@/test/unsavedChanges"
import { setupUser } from "@/test/user"
import GuideTopicForm from "./GuideTopicForm"

const user = setupUser()

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

vi.mock("@/components/admin/MarkdownEditor", () => ({
	default: () => null,
}))

const initialData = {
	id: 3,
	slug: "decisions",
	title: "Decisions",
	shortDescription: "How to make them.",
	description: "A longer description.",
	projectSlug: null,
	published: true,
}

beforeEach(() => {
	vi.resetAllMocks()
	mockRouter()
})

// #region Unsaved changes

describe("GuideTopicForm — unsaved changes", () => {
	it("guards closing the tab only once something was typed", async () => {
		render(<GuideTopicForm projects={[]} />)

		expect(isUnloadGuarded()).toBe(false)

		await user.type(screen.getByLabelText(/^title/i), "Decisions")

		expect(isUnloadGuarded()).toBe(true)
	})

	it("starts with no unsaved changes in edit mode", () => {
		render(<GuideTopicForm initialData={initialData} projects={[]} />)

		expect(isUnloadGuarded()).toBe(false)
	})

	it("stops guarding once the save succeeds", async () => {
		mockFetchOk()
		render(<GuideTopicForm initialData={initialData} projects={[]} />)

		await user.type(screen.getByLabelText(/^title/i), " revisited")

		expect(isUnloadGuarded()).toBe(true)

		await user.click(screen.getByRole("button", { name: /save topic/i }))

		await waitFor(() => expect(isUnloadGuarded()).toBe(false))
	})

	// The assertions are in `expectFailedSave`, which the lint rule can't see into.
	// eslint-disable-next-line sonarjs/assertions-in-tests
	it("shows the API's error and stays on the form, still guarded, when the save fails", async () => {
		const { push } = mockRouter()
		mockFetchError(409, { error: "Slug already taken" })
		render(<GuideTopicForm initialData={initialData} projects={[]} />)

		await user.type(screen.getByLabelText(/^title/i), " revisited")
		await user.click(screen.getByRole("button", { name: /save topic/i }))

		await expectFailedSave({
			message: "Slug already taken (HTTP 409)",
			push,
			saveButton: /save topic/i,
		})
	})
})

// #endregion
