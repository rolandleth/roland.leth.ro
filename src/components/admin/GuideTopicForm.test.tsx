import { render, screen, waitFor } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
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
	vi.mocked(useRouter).mockReturnValue({
		push: vi.fn(),
		refresh: vi.fn(),
	} as unknown as ReturnType<typeof useRouter>)
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
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers(),
			json: () => Promise.resolve({}),
		})
		render(<GuideTopicForm initialData={initialData} projects={[]} />)

		await user.type(screen.getByLabelText(/^title/i), " revisited")

		expect(isUnloadGuarded()).toBe(true)

		await user.click(screen.getByRole("button", { name: /save topic/i }))

		await waitFor(() => expect(isUnloadGuarded()).toBe(false))
	})

	it("keeps guarding when the save fails", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 409,
			headers: new Headers({ "content-type": "application/json" }),
			json: () => Promise.resolve({ error: "Slug already taken" }),
		})
		render(<GuideTopicForm initialData={initialData} projects={[]} />)

		await user.type(screen.getByLabelText(/^title/i), " revisited")
		await user.click(screen.getByRole("button", { name: /save topic/i }))

		await waitFor(() =>
			expect(screen.getByText(/Slug already taken/)).toBeInTheDocument()
		)
		expect(isUnloadGuarded()).toBe(true)
	})
})

// #endregion
