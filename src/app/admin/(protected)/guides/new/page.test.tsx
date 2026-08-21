import { redirect } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { verifySession } from "@/lib/auth/auth"
import { listGuideTopicOptions } from "@/lib/db/guides"
import { getProjectsForAdmin } from "@/lib/db/projects"
import NewGuidePage from "./page"

/**
 * `(protected)/layout.tsx`'s session check doesn't re-run on a client-side
 * navigation within the same route segment, so this page's own body-level
 * `requireAdminPageSession` call is what stops `getProjectsForAdmin()` and
 * `listGuideTopicOptions()` from reading the database on a request the layout
 * never checked. Mirrors `layout.test.tsx`'s coverage of the same defence
 * layer, one level in.
 */

vi.mock("@/lib/auth/auth", () => ({
	verifySession: vi.fn(),
}))

vi.mock("next/navigation", () => ({
	redirect: vi.fn(() => {
		throw new Error("REDIRECT")
	}),
}))

vi.mock("@/lib/db/guides", () => ({
	listGuideTopicOptions: vi.fn(),
}))

vi.mock("@/lib/db/projects", () => ({
	getProjectsForAdmin: vi.fn(),
}))

vi.mock("@/components/admin/GuideForm", () => ({
	default: () => null,
}))

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(listGuideTopicOptions).mockResolvedValue([])
	vi.mocked(getProjectsForAdmin).mockResolvedValue([])
})

describe("NewGuidePage", () => {
	it("renders when the session is valid", async () => {
		vi.mocked(verifySession).mockResolvedValue(true)

		await expect(NewGuidePage()).resolves.toBeTruthy()
		expect(redirect).not.toHaveBeenCalled()
	})

	it("redirects to login without a valid session", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(NewGuidePage()).rejects.toThrow("REDIRECT")
		expect(redirect).toHaveBeenCalledWith("/admin/login")
	})

	it("does not read the project or topic lists without a valid session", async () => {
		// The point of the guard: a bypassed request must not reach either read.
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(NewGuidePage()).rejects.toThrow("REDIRECT")
		expect(getProjectsForAdmin).not.toHaveBeenCalled()
		expect(listGuideTopicOptions).not.toHaveBeenCalled()
	})

	it("logs the bypass under this page's own tag", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(NewGuidePage()).rejects.toThrow("REDIRECT")

		expect(vi.mocked(console.error)).toHaveBeenCalledWith(
			expect.stringContaining("[admin:guides:new]"),
			expect.objectContaining({ surface: "the page body" })
		)
	})
})
