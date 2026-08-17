import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { requireCronAuth } from "@/lib/api/cronAuth"

/**
 * The only module in `src/lib/api/` that had no test file.
 *
 * The gap that mattered was narrower than "no coverage": every fixture in the
 * two consumer suites differs in LENGTH from the expected `Bearer <secret>`, so
 * they all short-circuit on the length check and the `timingSafeEqual` call —
 * the one place a real byte comparison decides a negative — never ran. Inverting
 * it left every test green. `SAME_LENGTH_WRONG` below is what closes that.
 */

const SECRET = "test-secret"
const TAG = "[api:cron:probe]"

/**
 * A wrong credential that is byte-for-byte the same length as the real one, so
 * the length check passes it through to `timingSafeEqual`.
 */
const SAME_LENGTH_WRONG = `Bearer ${"x".repeat(SECRET.length)}`

function makeRequest(authorization?: string): NextRequest {
	const headers = new Headers()

	if (authorization !== undefined) {
		headers.set("authorization", authorization)
	}

	return new NextRequest("http://localhost/api/cron/probe", { headers })
}

beforeEach(() => {
	vi.stubEnv("CRON_SECRET", SECRET)
	vi.spyOn(console, "warn").mockImplementation(() => undefined)
	vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
	vi.unstubAllEnvs()
})

// #region Authorization

describe("requireCronAuth", () => {
	it("authorizes the correct bearer token", () => {
		expect(requireCronAuth(makeRequest(`Bearer ${SECRET}`), TAG)).toBeNull()
	})

	it("rejects a same-length wrong secret", async () => {
		// The equal-length branch. Every other fixture in the codebase differs in
		// length and short-circuits before `timingSafeEqual`, so without this the
		// byte comparison is never executed by any test.
		expect(SAME_LENGTH_WRONG).toHaveLength(`Bearer ${SECRET}`.length)

		const response = requireCronAuth(makeRequest(SAME_LENGTH_WRONG), TAG)

		expect(response?.status).toBe(401)
	})

	it.each([
		["no header", undefined],
		["empty header", ""],
		["bare secret with no Bearer prefix", SECRET],
		["wrong scheme", `Token ${SECRET}`],
		["case-changed scheme", `bearer ${SECRET}`],
	])("rejects %s", (_label, authorization) => {
		expect(requireCronAuth(makeRequest(authorization), TAG)?.status).toBe(401)
	})

	it("authorizes despite surrounding header whitespace", () => {
		// Not our leniency: RFC 9110 makes whitespace around a header value
		// optional, and the Headers API strips it before this code sees anything.
		// The credential that arrives is byte-identical to the real one, so
		// accepting it is correct — pinned because it looks like a bug otherwise.
		expect(requireCronAuth(makeRequest(`Bearer ${SECRET} `), TAG)).toBeNull()
	})

	it("rejects a token that merely starts with the secret", () => {
		// A prefix match would authorize this. The comparison is whole-buffer.
		expect(
			requireCronAuth(makeRequest(`Bearer ${SECRET}-extra`), TAG)?.status
		).toBe(401)
	})
})

// #endregion

// #region Configuration

describe("requireCronAuth — CRON_SECRET configuration", () => {
	it.each([
		["unset", ""],
		["whitespace only", "   "],
		["a lone newline", "\n"],
	])("treats %s as not configured", (_label, value) => {
		vi.stubEnv("CRON_SECRET", value)

		const response = requireCronAuth(makeRequest(`Bearer ${SECRET}`), TAG)

		expect(response?.status).toBe(401)
	})

	it("tolerates a trailing newline on an otherwise valid secret", () => {
		// The realistic form of the bug: a value pasted into a dashboard picks up
		// a newline, counts as configured, and then fails the compare on every
		// run — a cron that stops silently, logged as routine scanner noise.
		vi.stubEnv("CRON_SECRET", `${SECRET}\n`)

		expect(requireCronAuth(makeRequest(`Bearer ${SECRET}`), TAG)).toBeNull()
	})

	it("logs a missing secret at error level, not warn", () => {
		// A server config fault, not an adversarial one. Demoting it to warn would
		// bury a deploy-time env regression among port scans.
		vi.stubEnv("CRON_SECRET", "")

		requireCronAuth(makeRequest(`Bearer ${SECRET}`), TAG)

		expect(vi.mocked(console.error)).toHaveBeenCalledWith(
			expect.stringContaining("CRON_SECRET not configured")
		)
		expect(vi.mocked(console.warn)).not.toHaveBeenCalled()
	})

	it("does not name the env var to the caller", () => {
		// A pre-auth probe must not learn the server is missing CRON_SECRET.
		vi.stubEnv("CRON_SECRET", "")

		const response = requireCronAuth(makeRequest(), TAG)

		expect(response?.status).toBe(401)
	})
})

// #endregion

// #region Log shape

describe("requireCronAuth — log shape", () => {
	it("prefixes lines with the caller's tag verbatim", () => {
		// The tag arrives pre-bracketed, matching `logMiddlewareBypass` and
		// `requireAdmin`. This helper used to bracket it itself, so passing an
		// already-bracketed tag rendered `[[api:cron:x]]` and fell out of every
		// alert grep built on the shape.
		requireCronAuth(makeRequest("Bearer nope"), TAG)

		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			expect.stringContaining(TAG),
			expect.anything()
		)
		expect(vi.mocked(console.warn)).not.toHaveBeenCalledWith(
			expect.stringContaining(`[${TAG}]`),
			expect.anything()
		)
	})

	it("distinguishes a stale cron from a port scan", () => {
		// The reason this branch is logged at all. A scanner sends no
		// authorization header; a cron with a rotated secret sends a wrong one.
		requireCronAuth(makeRequest("Bearer nope"), TAG)

		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				path: "/api/cron/probe",
				method: "GET",
				hasAuthorizationHeader: true,
			})
		)
	})

	it("reports an absent header as absent", () => {
		requireCronAuth(makeRequest(), TAG)

		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ hasAuthorizationHeader: false })
		)
	})

	it("never logs the offered credential", () => {
		// A near-miss of the real secret is precisely what must not reach a log
		// aggregator.
		requireCronAuth(makeRequest(SAME_LENGTH_WRONG), TAG)

		expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
			"xxxxxxxxxxx"
		)
	})
})

// #endregion
