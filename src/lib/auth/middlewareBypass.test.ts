import { readFileSync } from "node:fs"
import { join } from "node:path"
import { redirect } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { verifySession } from "@/lib/auth/auth"
import {
	bypassIdForRequest,
	logMiddlewareBypass,
	requireAdminPageSession,
} from "@/lib/auth/middlewareBypass"

vi.mock("@/lib/auth/auth", () => ({
	verifySession: vi.fn(),
}))

vi.mock("next/navigation", () => ({
	redirect: vi.fn(() => {
		throw new Error("REDIRECT")
	}),
}))

/**
 * The module had no test file. Coverage reported it green because all three
 * consumers exercise its lines, which made an untested contract look covered —
 * and the contract that mattered was asserted nowhere: every consumer test
 * checks `bypassId: expect.any(String)`, which passes just as happily when the
 * two guards on one request mint two different ids.
 *
 * That shared id is the module's entire reason to exist. A bypassed page request
 * trips `generateMetadata` and the protected layout independently, and without a
 * common field they are two error lines with different tags and nothing linking
 * them, so a count-based alert double-counts and no operator can tell one bypass
 * from two.
 */

beforeEach(() => {
	vi.resetAllMocks()
})

describe("bypassIdForRequest", () => {
	it("returns a 12-character id", () => {
		// Same shape as `respondInternalError`'s `requestId`, so one grep finds
		// both halves of an incident.
		expect(bypassIdForRequest()).toMatch(/^[0-9a-f]{12}$/)
	})

	it("mints a fresh id per call with no request scope around it", () => {
		// NOT the production behaviour, and pinned here so nobody reads the
		// absence of a same-id test as an oversight.
		//
		// `cache` memoizes per REQUEST, and a request scope only exists under
		// React's server dispatcher — which Next establishes and Vitest does not.
		// Outside one, `cache` degrades to calling straight through. So the
		// module's actual contract ("both guards on one request share an id")
		// cannot be asserted from a unit test at all; it needs a real request.
		//
		// What IS reachable is the regression that would realistically cause it:
		// someone dropping the `cache` wrapper. That is covered below.
		expect(bypassIdForRequest()).not.toBe(bypassIdForRequest())
	})

	it("routes the id through React's per-request memo", () => {
		// The structural half of the contract above. A refactor that replaced
		// `cache(randomShortId)` with a bare `randomShortId` would diverge the two
		// guards' ids in production while every runtime assertion here still
		// passed — exactly the silent degradation this module exists to prevent.
		const source = readFileSync(join(__dirname, "middlewareBypass.ts"), "utf8")

		expect(source).toMatch(/import \{ cache \} from "react"/)
		expect(source).toMatch(/bypassIdForRequest = cache\(/)
	})
})

describe("logMiddlewareBypass", () => {
	it("logs at error level, because reaching a guard should be unreachable", () => {
		// The middleware 401s or redirects these before they arrive, so a line
		// means the `src/proxy.ts` matcher missed the path. That is a security
		// event, not a routine 401 — and the only signal the matcher has a hole.
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

		logMiddlewareBypass("[admin:posts:edit]", "generateMetadata")

		expect(error).toHaveBeenCalled()
	})

	it("carries the greppable invariant text", () => {
		// Single-sourced here rather than hand-copied into each guard: rewording
		// it in one place would silently drop that guard out of any alert rule
		// built on the string.
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

		logMiddlewareBypass("[admin:posts:edit]", "the handler")

		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("the middleware gate did not run for this path"),
			expect.anything()
		)
	})

	it("names the surface it fired on", () => {
		// One alert rule has to distinguish "an API handler ran unauthenticated"
		// from "a page body rendered unauthenticated" — different defence layers
		// sit behind each.
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

		logMiddlewareBypass("[api:admin:posts:POST]", "the handler")

		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("reached the handler"),
			expect.objectContaining({ surface: "the handler" })
		)
	})

	it("gives every line a well-formed bypassId", () => {
		// Only the shape, deliberately. Whether two guards on ONE request share a
		// value depends on React's request scope, which no unit test can
		// establish — see `bypassIdForRequest` above.
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

		logMiddlewareBypass("[admin:posts:edit]", "generateMetadata", { id: "7" })
		logMiddlewareBypass("[admin:layout]", "the protected layout")

		for (const call of error.mock.calls) {
			const payload = call[1] as { bypassId: string }

			expect(payload.bypassId).toMatch(/^[0-9a-f]{12}$/)
		}
	})

	it("carries the record id when the guard has one", () => {
		// For a matcher hole, the value that got through is what narrows the
		// search for which path let it through.
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

		logMiddlewareBypass("[admin:posts:edit]", "generateMetadata", { id: "7" })

		expect(error).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ id: "7" })
		)
	})

	it("omits the record id when the guard has none", () => {
		// An API handler rejecting a bodyless request has no id in hand; logging
		// `id: undefined` would read as "the id was empty".
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

		logMiddlewareBypass("[api:admin:upload:POST]", "the handler")

		const payload = error.mock.calls[0][1] as Record<string, unknown>

		expect(payload).not.toHaveProperty("id")
	})
})

describe("requireAdminPageSession", () => {
	it("does nothing when the session is valid", async () => {
		vi.mocked(verifySession).mockResolvedValue(true)

		await expect(
			requireAdminPageSession("[admin:guides:new]")
		).resolves.toBeUndefined()
		expect(redirect).not.toHaveBeenCalled()
	})

	it("redirects to login without a valid session", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(requireAdminPageSession("[admin:guides:new]")).rejects.toThrow(
			"REDIRECT"
		)
		expect(redirect).toHaveBeenCalledWith("/admin/login")
	})

	it("logs the bypass under the page body surface before redirecting", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

		await expect(requireAdminPageSession("[admin:guides:new]")).rejects.toThrow(
			"REDIRECT"
		)

		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("[admin:guides:new]"),
			expect.objectContaining({ surface: "the page body" })
		)
	})

	it("does not log when the session is valid", async () => {
		vi.mocked(verifySession).mockResolvedValue(true)
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

		await requireAdminPageSession("[admin:guides:new]")

		expect(error).not.toHaveBeenCalled()
	})
})
