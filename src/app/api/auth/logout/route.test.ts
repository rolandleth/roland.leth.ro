import { beforeEach, describe, expect, it, vi } from "vitest"
import { destroySession } from "@/lib/auth/auth"
import { POST } from "./route"

vi.mock("@/lib/auth/auth", () => ({
	destroySession: vi.fn(),
}))

beforeEach(() => {
	vi.resetAllMocks()
})

describe("POST /api/auth/logout", () => {
	it("calls destroySession and returns 200", async () => {
		vi.mocked(destroySession).mockResolvedValue(undefined)

		const response = await POST()

		expect(destroySession).toHaveBeenCalledOnce()
		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.ok).toBe(true)
	})
})
