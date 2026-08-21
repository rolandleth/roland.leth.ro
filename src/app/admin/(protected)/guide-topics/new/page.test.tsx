import { redirect } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { verifySession } from "@/lib/auth/auth"
import { getProjectsForAdmin } from "@/lib/db/projects"
import NewGuideTopicPage from "./page"

/**
 * `(protected)/layout.tsx`'s session check doesn't re-run on a client-side
 * navigation within the same route segment, so this page's own body-level
 * `requireAdminPageSession` call is what stops `getProjectsForAdmin()` from
 * reading the database on a request the layout never checked. Mirrors the
 * sibling `guides/new/page.test.tsx`.
 */

vi.mock("@/lib/auth/auth", () => ({
	verifySession: vi.fn(),
}))

vi.mock("next/navigation", () => ({
	redirect: vi.fn(() => {
		throw new Error("REDIRECT")
	}),
}))

vi.mock("@/lib/db/projects", () => ({
	getProjectsForAdmin: vi.fn(),
}))

vi.mock("@/components/admin/GuideTopicForm", () => ({
	default: () => null,
}))

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(getProjectsForAdmin).mockResolvedValue([])
})

describe("NewGuideTopicPage", () => {
	it("renders when the session is valid", async () => {
		vi.mocked(verifySession).mockResolvedValue(true)

		await expect(NewGuideTopicPage()).resolves.toBeTruthy()
		expect(redirect).not.toHaveBeenCalled()
	})

	it("redirects to login without a valid session", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(NewGuideTopicPage()).rejects.toThrow("REDIRECT")
		expect(redirect).toHaveBeenCalledWith("/admin/login")
	})

	it("does not read the project list without a valid session", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(NewGuideTopicPage()).rejects.toThrow("REDIRECT")
		expect(getProjectsForAdmin).not.toHaveBeenCalled()
	})

	it("logs the bypass under this page's own tag", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(NewGuideTopicPage()).rejects.toThrow("REDIRECT")

		expect(vi.mocked(console.error)).toHaveBeenCalledWith(
			expect.stringContaining("[admin:guide-topics:new]"),
			expect.objectContaining({ surface: "the page body" })
		)
	})
})
