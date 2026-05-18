import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	EnvConfigError,
	getAdminCredentials,
	getCronSecret,
	getDatabaseUrl,
	getIpHashSecret,
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

describe("EnvConfigError", () => {
	it("required-var throws are tagged so handlers can branch on them", () => {
		vi.stubEnv("DATABASE_URL", "")
		try {
			getDatabaseUrl()
			expect.unreachable("getDatabaseUrl should have thrown")
		} catch (err) {
			expect(err).toBeInstanceOf(EnvConfigError)
			expect((err as EnvConfigError).code).toBe("ENV_MISSING")
			expect((err as EnvConfigError).varName).toBe("DATABASE_URL")
		}
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

	it("rejects a non-hex ADMIN_HASH_PASSWORD via the schema", () => {
		vi.stubEnv("ADMIN_EMAIL", "admin@example.com")
		vi.stubEnv("ADMIN_HASH_PASSWORD", "not-hex!!")
		expect(() => getAdminCredentials()).toThrow(/hex/)
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

// #region optional — ip hash secret

describe("getIpHashSecret", () => {
	it("returns the value when set", () => {
		vi.stubEnv("IP_HASH_SECRET", "hmac-secret")
		expect(getIpHashSecret()).toBe("hmac-secret")
	})

	it("returns null when missing", () => {
		vi.stubEnv("IP_HASH_SECRET", "")
		expect(getIpHashSecret()).toBeNull()
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
