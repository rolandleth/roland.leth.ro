import { beforeEach, describe, expect, it, vi } from "vitest"
import { adminEditMetadata } from "./adminMetadata"
import { verifySession } from "./auth"

vi.mock("./auth", () => ({
	verifySession: vi.fn(),
}))

const mockVerifySession = vi.mocked(verifySession)

describe("adminEditMetadata", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("titles the page from the record when the session is valid", async () => {
		mockVerifySession.mockResolvedValue(true)

		await expect(
			adminEditMetadata("[test]", "7", "Edit post", async () => "Hello world")
		).resolves.toEqual({ title: "Edit: Hello world" })
	})

	it("falls back when the record is missing", async () => {
		mockVerifySession.mockResolvedValue(true)

		await expect(
			adminEditMetadata("[test]", "7", "Edit post", async () => null)
		).resolves.toEqual({ title: "Edit post" })
	})

	// The point of the guard: metadata runs outside `(protected)/layout.tsx`, so
	// without this an unauthenticated request that slips past the middleware
	// matcher reaches the DB read and leaks the record's name in the title.
	it("never runs the loader without a valid session", async () => {
		mockVerifySession.mockResolvedValue(false)
		const loadName = vi.fn().mockResolvedValue("Secret draft")

		await expect(
			adminEditMetadata("[test]", "7", "Edit post", loadName)
		).resolves.toEqual({ title: "Edit post" })
		expect(loadName).not.toHaveBeenCalled()
	})

	it("short-circuits an unparseable id before checking the session", async () => {
		const loadName = vi.fn()

		await expect(
			adminEditMetadata("[test]", "not-an-id", "Edit post", loadName)
		).resolves.toEqual({ title: "Edit post" })
		expect(mockVerifySession).not.toHaveBeenCalled()
		expect(loadName).not.toHaveBeenCalled()
	})

	// #region logging

	it("logs at error level, because reaching here means the gate was bypassed", async () => {
		// The mirror of `requireAdmin`'s equivalent test. The middleware answers
		// unauthenticated page requests before `generateMetadata` runs, so a line
		// here means the matcher missed the path — the only signal that it has a
		// hole, since the fallback title is indistinguishable from a missing record.
		mockVerifySession.mockResolvedValue(false)
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)

		await adminEditMetadata("[admin:posts:edit]", "7", "Edit post", async () =>
			Promise.resolve(null)
		)

		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining("[admin:posts:edit]")
		)
		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining("middleware gate did not run")
		)

		consoleError.mockRestore()
	})

	it("does not log when the session is valid", async () => {
		mockVerifySession.mockResolvedValue(true)
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)

		await adminEditMetadata("[test]", "7", "Edit post", async () => "Title")

		expect(consoleError).not.toHaveBeenCalled()

		consoleError.mockRestore()
	})

	// An unparseable id is a routine 404-shaped request, not a bypass: the guard
	// returns before `verifySession` runs, so it must not raise a security line.
	it("does not log for an unparseable id", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)

		await adminEditMetadata("[test]", "not-an-id", "Edit post", vi.fn())

		expect(consoleError).not.toHaveBeenCalled()

		consoleError.mockRestore()
	})

	// #endregion
})
