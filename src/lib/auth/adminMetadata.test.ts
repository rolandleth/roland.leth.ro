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
			adminEditMetadata("7", "Edit post", async () => "Hello world")
		).resolves.toEqual({ title: "Edit: Hello world" })
	})

	it("falls back when the record is missing", async () => {
		mockVerifySession.mockResolvedValue(true)

		await expect(
			adminEditMetadata("7", "Edit post", async () => null)
		).resolves.toEqual({ title: "Edit post" })
	})

	// The point of the guard: metadata runs outside `(protected)/layout.tsx`, so
	// without this an unauthenticated request that slips past the middleware
	// matcher reaches the DB read and leaks the record's name in the title.
	it("never runs the loader without a valid session", async () => {
		mockVerifySession.mockResolvedValue(false)
		const loadName = vi.fn().mockResolvedValue("Secret draft")

		await expect(
			adminEditMetadata("7", "Edit post", loadName)
		).resolves.toEqual({ title: "Edit post" })
		expect(loadName).not.toHaveBeenCalled()
	})

	it("short-circuits an unparseable id before checking the session", async () => {
		const loadName = vi.fn()

		await expect(
			adminEditMetadata("not-an-id", "Edit post", loadName)
		).resolves.toEqual({ title: "Edit post" })
		expect(mockVerifySession).not.toHaveBeenCalled()
		expect(loadName).not.toHaveBeenCalled()
	})
})
