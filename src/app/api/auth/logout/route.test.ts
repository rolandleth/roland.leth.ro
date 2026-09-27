import { beforeEach, describe, expect, it, vi } from "vitest"
import { destroySession } from "@/lib/auth/auth"
import { POST } from "./route"

vi.mock("@/lib/auth/auth", () => ({
	destroySession: vi.fn(),
}))

beforeEach(() => {
	vi.resetAllMocks()
	vi.spyOn(console, "info").mockImplementation(() => undefined)
	vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

function logoutRequest(headers: Record<string, string> = {}): Request {
	return new Request("https://roland.leth.ro/api/auth/logout", {
		method: "POST",
		headers,
	})
}

describe("POST /api/auth/logout", () => {
	it("calls destroySession and returns 200", async () => {
		vi.mocked(destroySession).mockResolvedValue(undefined)

		const response = await POST(logoutRequest())

		expect(destroySession).toHaveBeenCalledOnce()
		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.ok).toBe(true)
	})

	it("logs a success line, the pair of the login one", async () => {
		await POST(logoutRequest())

		expect(console.info).toHaveBeenCalledWith("[api:auth:logout] success")
	})

	it("accepts a same-origin logout from the admin", async () => {
		const response = await POST(
			logoutRequest({
				"sec-fetch-site": "same-origin",
				origin: "https://roland.leth.ro",
			})
		)

		expect(response.status).toBe(200)
		expect(destroySession).toHaveBeenCalledOnce()
	})

	it("refuses a logout posted from a sibling subdomain", async () => {
		const response = await POST(
			logoutRequest({
				"sec-fetch-site": "same-site",
				origin: "https://other.leth.ro",
			})
		)

		expect(response.status).toBe(403)
		expect(destroySession).not.toHaveBeenCalled()
		expect(console.info).not.toHaveBeenCalled()
	})
})
