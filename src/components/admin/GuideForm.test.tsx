import { render, screen, waitFor } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DESCRIPTION_MAX_CHARS } from "@/lib/content/descriptionRules"
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
	vi.mocked(useRouter).mockReturnValue({
		push: vi.fn(),
		refresh: vi.fn(),
	} as unknown as ReturnType<typeof useRouter>)
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
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers(),
			json: () => Promise.resolve({}),
		})
		render(<GuideForm initialData={initialData} topics={[]} projects={[]} />)

		await user.type(screen.getByLabelText(/^title/i), " again")

		expect(isUnloadGuarded()).toBe(true)

		await user.click(screen.getByRole("button", { name: /save guide/i }))

		await waitFor(() => expect(isUnloadGuarded()).toBe(false))
	})
})

// #endregion
