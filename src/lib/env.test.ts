import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	getAdminCredentials,
	getCronSecret,
	getDatabaseUrl,
	getRedisConfig,
	getSessionSecret,
} from "./env"

beforeEach(() => {
	vi.unstubAllEnvs()
})

afterEach(() => {
	vi.unstubAllEnvs()
})

// #region required

describe("getDatabaseUrl", () => {
	it("returns the value when set", () => {
		vi.stubEnv("DATABASE_URL", "postgres://example")
		expect(getDatabaseUrl()).toBe("postgres://example")
	})

	it("throws when missing", () => {
		vi.stubEnv("DATABASE_URL", "")
		expect(() => getDatabaseUrl()).toThrow(/DATABASE_URL/)
	})

	it("treats empty string as missing", () => {
		vi.stubEnv("DATABASE_URL", "")
		expect(() => getDatabaseUrl()).toThrow(/not set/)
	})
})

describe("getSessionSecret", () => {
	it("returns the value when set", () => {
		vi.stubEnv("SESSION_SECRET", "abc")
		expect(getSessionSecret()).toBe("abc")
	})

	it("throws when missing", () => {
		vi.stubEnv("SESSION_SECRET", "")
		expect(() => getSessionSecret()).toThrow(/SESSION_SECRET/)
	})
})

// #endregion

// #region optional — admin credentials

describe("getAdminCredentials", () => {
	it("returns the pair when both are set", () => {
		vi.stubEnv("ADMIN_EMAIL", "admin@example.com")
		vi.stubEnv("ADMIN_HASH_PASSWORD", "deadbeef")
		expect(getAdminCredentials()).toEqual({
			email: "admin@example.com",
			passwordHash: "deadbeef",
		})
	})

	it("returns null when ADMIN_EMAIL is missing", () => {
		vi.stubEnv("ADMIN_EMAIL", "")
		vi.stubEnv("ADMIN_HASH_PASSWORD", "deadbeef")
		expect(getAdminCredentials()).toBeNull()
	})

	it("returns null when ADMIN_HASH_PASSWORD is missing", () => {
		vi.stubEnv("ADMIN_EMAIL", "admin@example.com")
		vi.stubEnv("ADMIN_HASH_PASSWORD", "")
		expect(getAdminCredentials()).toBeNull()
	})

	it("returns null when both are missing", () => {
		vi.stubEnv("ADMIN_EMAIL", "")
		vi.stubEnv("ADMIN_HASH_PASSWORD", "")
		expect(getAdminCredentials()).toBeNull()
	})
})

// #endregion

// #region optional — cron secret

describe("getCronSecret", () => {
	it("returns the value when set", () => {
		vi.stubEnv("CRON_SECRET", "topsecret")
		expect(getCronSecret()).toBe("topsecret")
	})

	it("returns null when missing", () => {
		vi.stubEnv("CRON_SECRET", "")
		expect(getCronSecret()).toBeNull()
	})
})

// #endregion

// #region optional — redis config

describe("getRedisConfig", () => {
	it("returns the pair when both are set", () => {
		vi.stubEnv("KV_REST_API_TOKEN", "tok")
		vi.stubEnv("KV_REST_API_URL", "https://example.upstash.io")
		expect(getRedisConfig()).toEqual({
			token: "tok",
			url: "https://example.upstash.io",
		})
	})

	it("returns null when only the token is set", () => {
		vi.stubEnv("KV_REST_API_TOKEN", "tok")
		vi.stubEnv("KV_REST_API_URL", "")
		expect(getRedisConfig()).toBeNull()
	})

	it("returns null when only the URL is set", () => {
		vi.stubEnv("KV_REST_API_TOKEN", "")
		vi.stubEnv("KV_REST_API_URL", "https://example.upstash.io")
		expect(getRedisConfig()).toBeNull()
	})

	it("returns null when neither is set", () => {
		vi.stubEnv("KV_REST_API_TOKEN", "")
		vi.stubEnv("KV_REST_API_URL", "")
		expect(getRedisConfig()).toBeNull()
	})
})

// #endregion
