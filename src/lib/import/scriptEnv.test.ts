import { afterEach, describe, expect, it, vi } from "vitest"
import {
	describeDatabaseUrl,
	readScriptEnv,
	SCRIPT_CREDENTIALS_HINT,
} from "@/lib/import/scriptEnv"

afterEach(() => {
	vi.unstubAllEnvs()
})

// #region readScriptEnv

describe("readScriptEnv", () => {
	it.each([
		["unset", undefined],
		["empty", ""],
		["whitespace only", "  \t"],
	])("reads %s as not set", (_label, value) => {
		vi.stubEnv("BLOB_READ_WRITE_TOKEN", value)

		expect(readScriptEnv("BLOB_READ_WRITE_TOKEN")).toBeNull()
	})

	it("returns a set value, trimmed", () => {
		vi.stubEnv("BLOB_READ_WRITE_TOKEN", " vercel_blob_rw_token \n")

		expect(readScriptEnv("BLOB_READ_WRITE_TOKEN")).toBe("vercel_blob_rw_token")
	})
})

// #endregion

// #region SCRIPT_CREDENTIALS_HINT

describe("SCRIPT_CREDENTIALS_HINT", () => {
	it("names the file the scripts read and pulls production into it", () => {
		// A bare `vercel env pull` writes Development values to `.env.local`, which
		// no script reads. The hint has to name both the file and the environment.
		expect(SCRIPT_CREDENTIALS_HINT).toContain("`.env`")
		expect(SCRIPT_CREDENTIALS_HINT).toContain(
			"vercel env pull .env --environment=production"
		)
	})
})

// #endregion

// #region describeDatabaseUrl

describe("describeDatabaseUrl", () => {
	it("names user, host, port and database, without the password", () => {
		const description = describeDatabaseUrl(
			"postgres://app_user:s3cret@db.example.com:5432/site?sslmode=require"
		)

		expect(description).toBe("app_user@db.example.com:5432/site")
		expect(description).not.toContain("s3cret")
		expect(description).not.toContain("sslmode")
	})

	it("keeps the user, which names the database when many share one host", () => {
		expect(
			describeDatabaseUrl(
				"postgres://a1b2c3:key@db.prisma.io:5432/postgres?sslmode=require"
			)
		).toBe("a1b2c3@db.prisma.io:5432/postgres")
	})

	it("drops a query-string credential", () => {
		const description = describeDatabaseUrl(
			"prisma+postgres://accelerate.prisma-data.net/?api_key=secret-key"
		)

		expect(description).toBe("accelerate.prisma-data.net")
		expect(description).not.toContain("secret-key")
	})

	it("describes a local database", () => {
		expect(describeDatabaseUrl("postgres://localhost:5432/site_dev")).toBe(
			"localhost:5432/site_dev"
		)
	})

	it.each([["not a url"], [""], ["postgres:"]])(
		"returns null for %j, which isn't a URL with a host",
		(value) => {
			expect(describeDatabaseUrl(value)).toBeNull()
		}
	)
})

// #endregion
