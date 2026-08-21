import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	EnvConfigError,
	getAdminCredentials,
	getCronSecret,
	getDatabaseUrl,
	getIndexNowKey,
	getIpHashSecret,
	getRedisConfig,
	getSessionSecret,
	getSiteUrl,
	isValidIndexNowKey,
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
	const validSecret = "a".repeat(32)

	it("returns the value when set", () => {
		vi.stubEnv("SESSION_SECRET", validSecret)
		expect(getSessionSecret()).toBe(validSecret)
	})

	it("throws when missing", () => {
		vi.stubEnv("SESSION_SECRET", "")
		expect(() => getSessionSecret()).toThrow(/SESSION_SECRET/)
	})

	it("accepts exactly the minimum length", () => {
		vi.stubEnv("SESSION_SECRET", "a".repeat(32))
		expect(getSessionSecret()).toHaveLength(32)
	})

	it("throws below the minimum length, naming the actual length", () => {
		// The value is the raw HS256 key, so a short one is brute-forceable
		// offline from any captured token.
		vi.stubEnv("SESSION_SECRET", "a".repeat(31))
		expect(() => getSessionSecret()).toThrow(
			/at least 32 characters \(got 31\)/
		)
	})

	it("keeps the failure scoped to the session path", () => {
		// Checked in the accessor rather than the schema so a short secret can't
		// fail `readEnv()` for every consumer and take the public site down.
		vi.stubEnv("SESSION_SECRET", "short")
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://roland.leth.ro")

		expect(() => getSessionSecret()).toThrow(/SESSION_SECRET/)
		expect(getSiteUrl()).toBe("https://roland.leth.ro")
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

	it.each([
		["ADMIN_EMAIL is missing", "", "deadbeef"],
		["ADMIN_HASH_PASSWORD is missing", "admin@example.com", ""],
		["both are missing", "", ""],
	])("returns null when %s", (_label, email, passwordHash) => {
		vi.stubEnv("ADMIN_EMAIL", email)
		vi.stubEnv("ADMIN_HASH_PASSWORD", passwordHash)
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

// #region optional — indexnow key

describe("getIndexNowKey", () => {
	it("returns the value when set", () => {
		vi.stubEnv("INDEXNOW_KEY", "a".repeat(32))
		expect(getIndexNowKey()).toBe("a".repeat(32))
	})

	it("returns null when missing", () => {
		vi.stubEnv("INDEXNOW_KEY", "")
		expect(getIndexNowKey()).toBeNull()
	})

	it("trims surrounding whitespace so a padded value stays valid", () => {
		// A trailing newline from pasting the value into the env would fail the
		// charset check and read as "malformed" for a key that looks correct.
		const key = "a".repeat(32)
		vi.stubEnv("INDEXNOW_KEY", ` ${key}\n`)

		const trimmed = getIndexNowKey()

		expect(trimmed).toBe(key)
		expect(isValidIndexNowKey(trimmed as string)).toBe(true)
	})

	it("returns null for a whitespace-only value", () => {
		vi.stubEnv("INDEXNOW_KEY", "   ")
		expect(getIndexNowKey()).toBeNull()
	})

	it("returns a malformed value rather than throwing", () => {
		// The whole point of moving the format check out of the schema: a bad
		// value here must not fail `readEnv()` for every other consumer.
		vi.stubEnv("INDEXNOW_KEY", "abcd_efgh_ijkl")
		expect(getIndexNowKey()).toBe("abcd_efgh_ijkl")
	})

	it("does not break unrelated accessors when malformed", () => {
		// The regression this move exists to prevent: a junk IndexNow key used to
		// fail the whole aggregate parse, taking login and site-URL down with it.
		const secret = "a".repeat(32)
		vi.stubEnv("SESSION_SECRET", secret)
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://roland.leth.ro")
		vi.stubEnv("INDEXNOW_KEY", "!!! not a key !!!")

		expect(getSessionSecret()).toBe(secret)
		expect(getSiteUrl()).toBe("https://roland.leth.ro")
	})
})

describe("isValidIndexNowKey", () => {
	it("accepts the protocol's length bounds", () => {
		expect(isValidIndexNowKey("a".repeat(8))).toBe(true)
		expect(isValidIndexNowKey("b".repeat(128))).toBe(true)
	})

	it("accepts hyphens, which the protocol's charset allows", () => {
		expect(isValidIndexNowKey("abcd-efgh-ijkl")).toBe(true)
	})

	it("rejects keys outside the protocol's length bounds", () => {
		expect(isValidIndexNowKey("a".repeat(7))).toBe(false)
		expect(isValidIndexNowKey("a".repeat(129))).toBe(false)
	})

	it("rejects characters outside the protocol's charset", () => {
		// An underscore or a stray quote pasted into the Vercel dashboard.
		expect(isValidIndexNowKey("abcd_efgh_ijkl")).toBe(false)
		expect(isValidIndexNowKey(`"${"a".repeat(32)}"`)).toBe(false)
	})

	it("rejects base64 output, the likeliest way to generate a bad key", () => {
		// `openssl rand -base64 32` emits `+`, `/` and `=`.
		expect(isValidIndexNowKey("Ab+c/dEf=")).toBe(false)
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

	it.each([
		["only the token is set", "tok", ""],
		["only the URL is set", "", "https://example.upstash.io"],
		["neither is set", "", ""],
	])("returns null when %s", (_label, token, url) => {
		vi.stubEnv("KV_REST_API_TOKEN", token)
		vi.stubEnv("KV_REST_API_URL", url)
		expect(getRedisConfig()).toBeNull()
	})
})

// #endregion

// #region site url

describe("getSiteUrl", () => {
	it("returns NEXT_PUBLIC_SITE_URL normalized to its origin", () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://roland.leth.ro/")
		expect(getSiteUrl()).toBe("https://roland.leth.ro")
	})

	it("strips a path from NEXT_PUBLIC_SITE_URL, keeping only the origin", () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://roland.leth.ro/blog/tech")
		expect(getSiteUrl()).toBe("https://roland.leth.ro")
	})

	it("throws EnvConfigError when NEXT_PUBLIC_SITE_URL is not an absolute URL", () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "roland.leth.ro")
		expect(() => getSiteUrl()).toThrow(EnvConfigError)
		expect(() => getSiteUrl()).toThrow(/not a valid absolute URL/)
	})

	it("falls back to VERCEL_PROJECT_PRODUCTION_URL as an https origin", () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "")
		vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "my-app.vercel.app")
		expect(getSiteUrl()).toBe("https://my-app.vercel.app")
	})

	it("prefers NEXT_PUBLIC_SITE_URL over the Vercel fallback", () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://roland.leth.ro")
		vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "my-app.vercel.app")
		expect(getSiteUrl()).toBe("https://roland.leth.ro")
	})

	it("throws when neither site-url signal is set", () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "")
		vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "")
		expect(() => getSiteUrl()).toThrow(EnvConfigError)
	})
})

// #endregion
