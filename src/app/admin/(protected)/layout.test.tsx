import { redirect } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { verifySession } from "@/lib/auth/auth"
import ProtectedLayout from "./layout"

vi.mock("@/lib/auth/auth", () => ({
	verifySession: vi.fn(),
}))

// The real `redirect` throws a Next control-flow signal the test runner can't
// distinguish from a failure, so it's stubbed to throw a recognisable one.
vi.mock("next/navigation", () => ({
	redirect: vi.fn(() => {
		throw new Error("REDIRECT")
	}),
}))

vi.mock("@/components/admin/AdminNav", () => ({
	default: function MockAdminNav() {
		return null
	},
}))

beforeEach(() => {
	vi.resetAllMocks()
})

describe("ProtectedLayout", () => {
	it("renders the children when the session is valid", async () => {
		vi.mocked(verifySession).mockResolvedValue(true)

		const element = await ProtectedLayout({ children: "body" })

		expect(element).toBeTruthy()
		expect(vi.mocked(redirect)).not.toHaveBeenCalled()
	})

	it("redirects to the login screen without a valid session", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(ProtectedLayout({ children: "body" })).rejects.toThrow(
			"REDIRECT"
		)
		expect(vi.mocked(redirect)).toHaveBeenCalledWith("/admin/login")
	})

	// #region bypass logging

	// The mirror of `requireAdmin.test.ts` and `adminMetadata.test.ts`. This is
	// the third guard in the same defence layer and was the one with no test:
	// the middleware redirects unauthenticated page requests before they reach
	// the layout, so a line here means the `src/proxy.ts` matcher missed the
	// path. The redirect alone is indistinguishable from a normal login bounce.
	it("logs at error level, because reaching here means the gate was bypassed", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(ProtectedLayout({ children: "body" })).rejects.toThrow(
			"REDIRECT"
		)

		expect(vi.mocked(console.error)).toHaveBeenCalledWith(
			expect.stringContaining("[admin:layout]"),
			expect.objectContaining({
				surface: "the protected layout",
				bypassId: expect.any(String),
			})
		)
		expect(vi.mocked(console.error)).toHaveBeenCalledWith(
			expect.stringContaining("middleware gate did not run"),
			expect.anything()
		)
	})

	// Deliberately no "logs before redirecting" test here. `redirect` is mocked
	// to throw, so the preceding test already proves the log happened before it —
	// a bare `toHaveBeenCalled()` would add no constraint the assertions above
	// don't already carry, while reading like independent coverage.

	it("does not log when the session is valid", async () => {
		vi.mocked(verifySession).mockResolvedValue(true)

		await ProtectedLayout({ children: "body" })

		expect(vi.mocked(console.error)).not.toHaveBeenCalled()
	})

	// #endregion
})
