import { beforeEach, describe, expect, it, vi } from "vitest"
import { verifySession } from "@/lib/auth"
import LoginPage from "./page"

vi.mock("@/lib/auth", () => ({
	verifySession: vi.fn(),
}))

vi.mock("next/navigation", () => ({
	redirect: vi.fn((url: string) => {
		throw new Error(`REDIRECT:${url}`)
	}),
}))

vi.mock("@/components/admin/LoginForm", () => ({
	default: function MockLoginForm() {
		return null
	},
}))

beforeEach(() => {
	vi.resetAllMocks()
})

describe("LoginPage", () => {
	it("redirects authenticated visitors to /admin", async () => {
		// Already-authed users shouldn't see the login form (and shouldn't be
		// able to log in twice). Mirrors the proxy behavior for protected
		// routes but in the opposite direction.
		vi.mocked(verifySession).mockResolvedValue(true)

		await expect(LoginPage()).rejects.toThrow("REDIRECT:/admin")
	})

	it("renders the login form when not authenticated", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		const result = await LoginPage()
		expect(result).toBeDefined()
	})
})
