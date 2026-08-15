import { describe, expect, it, vi } from "vitest"
import { verifySession } from "@/lib/auth/auth"
import { requireAdmin } from "./requireAdmin"

vi.mock("@/lib/auth/auth", () => ({
	verifySession: vi.fn(),
}))

const mockVerifySession = vi.mocked(verifySession)

// `src/test/setup.ts` already replaces `console.error` with a `vi.fn()` before
// every test, so read that mock rather than layering a `vi.spyOn` on top of it.
const consoleError = () => vi.mocked(console.error)

describe("requireAdmin", () => {
	it("returns null so the handler proceeds when the session is valid", async () => {
		mockVerifySession.mockResolvedValue(true)

		await expect(requireAdmin("[test]")).resolves.toBeNull()
	})

	it("returns a 401 when there is no valid session", async () => {
		mockVerifySession.mockResolvedValue(false)

		const response = await requireAdmin("[test]")

		expect(response?.status).toBe(401)
		expect(await response?.json()).toEqual({ error: "Unauthorized" })
	})

	it("logs at error level, because reaching here means the gate was bypassed", async () => {
		// Not a routine 401: the middleware answers unauthenticated requests
		// before they reach a handler, so a line here means a request got past
		// the matcher. That is a security event and has to be greppable.
		mockVerifySession.mockResolvedValue(false)

		await requireAdmin("[api:admin:posts:DELETE]")

		expect(consoleError()).toHaveBeenCalledWith(
			expect.stringContaining("[api:admin:posts:DELETE]"),
			expect.anything()
		)
		expect(consoleError()).toHaveBeenCalledWith(
			expect.stringContaining("middleware gate did not run"),
			expect.anything()
		)
	})

	// The shared shape: one alert rule reads `surface` to tell an API handler
	// running unauthenticated from a page body doing the same.
	it("tags the line with the handler surface", async () => {
		mockVerifySession.mockResolvedValue(false)

		await requireAdmin("[api:admin:posts:DELETE]")

		expect(consoleError()).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				surface: "the handler",
				bypassId: expect.any(String),
			})
		)
	})

	it("does not log when the session is valid", async () => {
		mockVerifySession.mockResolvedValue(true)

		await requireAdmin("[test]")

		expect(consoleError()).not.toHaveBeenCalled()
	})
})
