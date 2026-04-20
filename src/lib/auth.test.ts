import bcrypt from "bcryptjs"
import { jwtVerify, SignJWT } from "jose"
import { cookies } from "next/headers"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createSession,
	destroySession,
	getSessionSecret,
	verifyCredentials,
	verifySession,
	verifyToken,
} from "@/lib/auth"

// Must be declared before the module under test is imported so the hoisted
// vi.mock() factory can reference it.
const mockCookieStore = {
	set: vi.fn(),
	delete: vi.fn(),
	get: vi.fn(),
}

vi.mock("next/headers", () => ({
	cookies: vi.fn(),
}))

// #region Shared test constants

const TEST_SECRET = "test-secret-must-be-at-least-32-chars-x"
const TEST_EMAIL = "admin@example.com"
const TEST_PASSWORD = "correct-password-123"

// Rounds=4 keeps bcrypt fast in tests while still exercising the real hash.
const TEST_HASH = bcrypt.hashSync(TEST_PASSWORD, 4)
const TEST_HEX_HASH = Buffer.from(TEST_HASH).toString("hex")

beforeEach(() => {
	vi.stubEnv("SESSION_SECRET", TEST_SECRET)
	vi.stubEnv("ADMIN_EMAIL", TEST_EMAIL)
	vi.stubEnv("ADMIN_HASH_PASSWORD", TEST_HEX_HASH)
	vi.mocked(cookies).mockResolvedValue(
		mockCookieStore as unknown as Awaited<ReturnType<typeof cookies>>
	)
	mockCookieStore.set.mockReset()
	mockCookieStore.delete.mockReset()
	mockCookieStore.get.mockReset()
})

// #endregion

// #region verifyCredentials

describe("verifyCredentials", () => {
	it("returns true for correct email and password", async () => {
		expect(await verifyCredentials(TEST_EMAIL, TEST_PASSWORD)).toBe(true)
	})

	it("returns false for a wrong password", async () => {
		expect(await verifyCredentials(TEST_EMAIL, "wrong-password")).toBe(false)
	})

	it("returns false for a wrong email", async () => {
		expect(await verifyCredentials("other@example.com", TEST_PASSWORD)).toBe(
			false
		)
	})

	it("returns false for both wrong email and password", async () => {
		expect(await verifyCredentials("other@example.com", "wrong")).toBe(false)
	})

	it("returns false when ADMIN_EMAIL env var is missing", async () => {
		delete process.env.ADMIN_EMAIL
		expect(await verifyCredentials(TEST_EMAIL, TEST_PASSWORD)).toBe(false)
	})

	it("returns false when ADMIN_HASH_PASSWORD env var is missing", async () => {
		delete process.env.ADMIN_HASH_PASSWORD
		expect(await verifyCredentials(TEST_EMAIL, TEST_PASSWORD)).toBe(false)
	})

	it("returns false for an empty email", async () => {
		expect(await verifyCredentials("", TEST_PASSWORD)).toBe(false)
	})

	it("returns false for an empty password", async () => {
		expect(await verifyCredentials(TEST_EMAIL, "")).toBe(false)
	})

	it("returns false for both empty email and password", async () => {
		expect(await verifyCredentials("", "")).toBe(false)
	})
})

// #endregion

// #region createSession

// 7 days in seconds, matching `SESSION_DURATION` in `src/lib/auth.ts`.
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7

describe("createSession", () => {
	it("writes the session cookie with the expected options and name", async () => {
		await createSession()
		expect(mockCookieStore.set).toHaveBeenCalledOnce()

		const [name, , options] = mockCookieStore.set.mock.calls[0]
		expect(name).toBe("session")
		expect(options).toMatchObject({
			httpOnly: true,
			sameSite: "lax",
			maxAge: SEVEN_DAYS_SECONDS,
			path: "/",
		})
	})

	it("stores a valid JWT token that can be verified", async () => {
		await createSession()
		const [, token] = mockCookieStore.set.mock.calls[0]
		const secret = new TextEncoder().encode(TEST_SECRET)
		const { payload } = await jwtVerify(token, secret)
		expect(payload).toMatchObject({ admin: true })
	})
})

// #endregion

// #region destroySession

describe("destroySession", () => {
	it("calls cookieStore.delete with the session cookie name", async () => {
		await destroySession()
		expect(mockCookieStore.delete).toHaveBeenCalledWith("session")
	})

	it("does not call cookieStore.set", async () => {
		await destroySession()
		expect(mockCookieStore.set).not.toHaveBeenCalled()
	})
})

// #endregion

// #region verifySession

describe("verifySession", () => {
	async function signToken(
		overrides: { expirationTime?: string; payload?: object } = {}
	) {
		const secret = new TextEncoder().encode(TEST_SECRET)
		return new SignJWT({ admin: true, ...overrides.payload })
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime(overrides.expirationTime ?? "7d")
			.sign(secret)
	}

	it("returns true for a valid session token", async () => {
		const token = await signToken()
		mockCookieStore.get.mockReturnValue({ value: token })
		expect(await verifySession()).toBe(true)
	})

	it("returns false when no cookie is present", async () => {
		mockCookieStore.get.mockReturnValue(undefined)
		expect(await verifySession()).toBe(false)
	})

	it("returns false for an expired token", async () => {
		// Vitest doesn't fake timers here — we set expiration to the past via
		// a negative duration which jose represents as already-expired.
		const secret = new TextEncoder().encode(TEST_SECRET)
		const expiredToken = await new SignJWT({ admin: true })
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			// Set issued-at and expiration both in the past
			.setExpirationTime(Math.floor(Date.now() / 1000) - 60)
			.sign(secret)
		mockCookieStore.get.mockReturnValue({ value: expiredToken })
		expect(await verifySession()).toBe(false)
	})

	it("returns false for a tampered token", async () => {
		const token = await signToken()
		// Corrupt the signature (last segment)
		const parts = token.split(".")
		parts[2] = parts[2].slice(0, -4) + "xxxx"
		mockCookieStore.get.mockReturnValue({ value: parts.join(".") })
		expect(await verifySession()).toBe(false)
	})

	it("returns false for a token signed with a different secret", async () => {
		const wrongSecret = new TextEncoder().encode(
			"completely-different-secret-xx"
		)
		const wrongToken = await new SignJWT({ admin: true })
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("7d")
			.sign(wrongSecret)
		mockCookieStore.get.mockReturnValue({ value: wrongToken })
		expect(await verifySession()).toBe(false)
	})

	it("returns false for a garbage string in the cookie", async () => {
		mockCookieStore.get.mockReturnValue({ value: "not.a.jwt" })
		expect(await verifySession()).toBe(false)
	})

	it("throws when cookie is present but SESSION_SECRET env is missing", async () => {
		// Mirror the proxy contract: missing secret with a token present is a
		// deployment fault and must surface, not silently pass auth.
		const token = await signToken()
		mockCookieStore.get.mockReturnValue({ value: token })
		delete process.env.SESSION_SECRET
		await expect(verifySession()).rejects.toThrow(/SESSION_SECRET/)
	})

	it("returns false with no cookie even when SESSION_SECRET is missing", async () => {
		// Short-circuits before reading the secret, so missing env is irrelevant.
		mockCookieStore.get.mockReturnValue(undefined)
		delete process.env.SESSION_SECRET
		expect(await verifySession()).toBe(false)
	})
})

// #endregion

// #region verifyToken

describe("verifyToken", () => {
	const secret = new TextEncoder().encode(TEST_SECRET)

	async function sign(
		payload: Record<string, unknown>,
		expirationTime: string | number = "7d",
		withSecret: Uint8Array = secret
	): Promise<string> {
		return new SignJWT(payload)
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime(expirationTime)
			.sign(withSecret)
	}

	it("returns the decoded payload for a valid token", async () => {
		const token = await sign({ admin: true })
		const payload = await verifyToken(token, secret)
		expect(payload).not.toBeNull()
		expect(payload?.admin).toBe(true)
	})

	it("returns null for a token signed with a different secret", async () => {
		const wrongSecret = new TextEncoder().encode(
			"completely-different-secret-xx"
		)
		const token = await sign({ admin: true }, "7d", wrongSecret)
		expect(await verifyToken(token, secret)).toBeNull()
	})

	it("returns null for an expired token", async () => {
		const token = await sign(
			{ admin: true },
			Math.floor(Date.now() / 1000) - 60
		)
		expect(await verifyToken(token, secret)).toBeNull()
	})

	it("returns null for a garbage string", async () => {
		expect(await verifyToken("not.a.jwt", secret)).toBeNull()
	})

	it("returns null for an empty string", async () => {
		expect(await verifyToken("", secret)).toBeNull()
	})
})

// #endregion

// #region getSessionSecret

describe("getSessionSecret", () => {
	it("returns a Uint8Array derived from SESSION_SECRET", () => {
		const secret = getSessionSecret()
		expect(secret).toBeInstanceOf(Uint8Array)
		expect(new TextDecoder().decode(secret)).toBe(TEST_SECRET)
	})
})

// #endregion
