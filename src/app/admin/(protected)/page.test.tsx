import { beforeEach, describe, expect, it, vi } from "vitest"
import { verifySession } from "@/lib/auth/auth"
import AdminDashboard from "./page"

/**
 * No test file existed for this page before — the dashboard root is the one
 * every protected page links back to (`AdminNav`'s home link, plus its own
 * tab switcher is a same-layout nav into itself), so it's the page most
 * exposed to the client-nav gap `requireAdminPageSession` exists for, and it
 * has no `generateMetadata` to carry any part of the check.
 */

vi.mock("@/lib/auth/auth", () => ({
	verifySession: vi.fn(),
}))

vi.mock("next/navigation", () => ({
	redirect: vi.fn(() => {
		throw new Error("REDIRECT")
	}),
}))

vi.mock("@/components/admin/PostsTab", () => ({
	default: vi.fn(() => null),
}))

vi.mock("@/components/admin/ProjectsTab", () => ({
	default: vi.fn(() => null),
}))

vi.mock("@/components/admin/GuidesTab", () => ({
	default: vi.fn(() => null),
}))

vi.mock("@/components/admin/RevalidatePanel", () => ({
	default: () => null,
}))

vi.mock("@/components/admin/IndexNowPanel", () => ({
	default: () => null,
}))

vi.mock("@/components/admin/AdminSearch", () => ({
	default: () => null,
}))

function searchParams(
	params: { tab?: string; page?: string; q?: string } = {}
) {
	return { searchParams: Promise.resolve(params) }
}

beforeEach(() => {
	vi.resetAllMocks()
})

describe("AdminDashboard", () => {
	it("renders the default tab when the session is valid", async () => {
		const PostsTab = (await import("@/components/admin/PostsTab")).default
		vi.mocked(verifySession).mockResolvedValue(true)

		const element = await AdminDashboard(searchParams())
		// "Resolved truthy" alone doesn't prove a tab actually made it into the
		// tree — the wrapping <div> would satisfy that on its own. JSX doesn't
		// invoke a child component until something actually renders the tree,
		// so this inspects the returned element structure directly rather than
		// asserting the mock was called.
		const children = element.props.children as unknown[]
		const tabElement = children.find(
			(child) =>
				child != null &&
				typeof child === "object" &&
				"type" in child &&
				child.type === PostsTab
		) as { props: { query: string; page: number } } | undefined

		expect(tabElement).toBeDefined()
		expect(tabElement?.props).toEqual({ query: "", page: 1 })
	})

	it("redirects to login without a valid session", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(AdminDashboard(searchParams())).rejects.toThrow("REDIRECT")
	})

	it("logs the bypass under the dashboard tag with the page body surface", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(AdminDashboard(searchParams())).rejects.toThrow("REDIRECT")

		expect(vi.mocked(console.error)).toHaveBeenCalledWith(
			expect.stringContaining("[admin:dashboard]"),
			expect.objectContaining({ surface: "the page body" })
		)
	})
})
