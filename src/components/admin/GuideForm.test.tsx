import { render, screen } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DESCRIPTION_MAX_CHARS } from "@/lib/content/descriptionRules"
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
