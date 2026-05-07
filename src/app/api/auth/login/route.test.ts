import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSession, verifyCredentials } from "@/lib/auth"
import { POST } from "./route"

vi.mock("@/lib/auth", () => ({
	verifyCredentials: vi.fn(),
	createSession: vi.fn(),
}))

// @upstash/ratelimit / @upstash/redis are only instantiated when the env var
// `KV_REST_API_TOKEN` is present at module-load time. With `.env.test` not
// setting it, these tests exercise the `ratelimit === null` branch. The
// rate-limit path is covered by an explicit integration test in future work.
function makeRequest(body: unknown, { rawBody }: { rawBody?: string } = {}) {
	return new Request("http://localhost/api/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: rawBody ?? JSON.stringify(body),
	})
}

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Body parsing

describe("POST /api/auth/login — body parsing", () => {
	it("returns 400 when the request body isn't valid JSON", async () => {
		const response = await POST(
			makeRequest(null, { rawBody: "not-json" }) as never
		)

		expect(response.status).toBe(400)
		const data = await response.json()
		expect(data.error).toBe("Invalid request body")
	})

	it("returns 400 when the body passes schema but email is malformed", async () => {
		const response = await POST(
			makeRequest({ email: "not-an-email", password: "secret" }) as never
		)

		expect(response.status).toBe(400)
	})

	it("returns 400 when email is missing", async () => {
		const response = await POST(makeRequest({ password: "secret" }) as never)

		expect(response.status).toBe(400)
	})

	it("returns 400 when password is empty", async () => {
		const response = await POST(
			makeRequest({ email: "admin@example.com", password: "" }) as never
		)

		expect(response.status).toBe(400)
	})
})

// #endregion

// #region Credential verification

describe("POST /api/auth/login — credentials", () => {
	it("returns 401 when verifyCredentials returns false", async () => {
		vi.mocked(verifyCredentials).mockResolvedValue(false)

		const response = await POST(
			makeRequest({ email: "admin@example.com", password: "wrong" }) as never
		)

		expect(response.status).toBe(401)
		const data = await response.json()
		expect(data.error).toBe("Invalid credentials")
		expect(createSession).not.toHaveBeenCalled()
	})

	it("creates a session and returns 200 on valid credentials", async () => {
		vi.mocked(verifyCredentials).mockResolvedValue(true)
		vi.mocked(createSession).mockResolvedValue(undefined)

		const response = await POST(
			makeRequest({ email: "admin@example.com", password: "right" }) as never
		)

		expect(response.status).toBe(200)
		expect(createSession).toHaveBeenCalledOnce()
		const data = await response.json()
		expect(data.ok).toBe(true)
	})

	it("passes the parsed email and password to verifyCredentials", async () => {
		vi.mocked(verifyCredentials).mockResolvedValue(true)

		await POST(
			makeRequest({
				email: "ADMIN@example.com",
				password: "a-long-password",
			}) as never
		)

		// loginSchema normalizes the email to lowercase + trim before reaching
		// `verifyCredentials`, so a mixed-case typo still matches the configured
		// admin email.
		expect(verifyCredentials).toHaveBeenCalledWith(
			"admin@example.com",
			"a-long-password"
		)
	})
})

// #endregion
