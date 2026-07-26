import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "@/app/api/admin/indexnow/route"
import sitemap from "@/app/sitemap"
import * as env from "@/lib/auth/env"
import { submitToIndexNow } from "@/lib/content/indexnow"
import type { IndexNowResult } from "@/lib/content/indexnow"
import type { MetadataRoute } from "next"

vi.mock("@/lib/api/requireAdmin", async () => {
	const { requireAdminMockFactory } = await import("@/test/mocks/requireAdmin")

	return requireAdminMockFactory()
})

vi.mock("@/app/sitemap", () => ({ default: vi.fn() }))

// Keep the real guards (`findForeignHostUrls`, `isSubmittableOrigin`) and
// endpoint constant; only the network call is stubbed.
vi.mock("@/lib/content/indexnow", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/content/indexnow")>()

	return { ...actual, submitToIndexNow: vi.fn() }
})

const KEY = "test-key-1234abcd"

/** Shapes a sitemap entry; the route only reads `.url`. */
function entry(url: string): MetadataRoute.Sitemap[number] {
	return { url }
}

function okResult(count: number): IndexNowResult {
	return {
		ok: true,
		attempted: count,
		accepted: count,
		batches: [{ status: 200, ok: true, message: "", errorName: null, count }],
	}
}

/** POST request to the route; `dryRun` adds the preview-only query flag. */
function request(dryRun = false): Request {
	const url = `https://roland.leth.ro/api/admin/indexnow${dryRun ? "?dryRun" : ""}`

	return new Request(url, { method: "POST" })
}

/** POST request carrying an explicit `?dryRun=<value>`. */
function requestWithDryRun(value: string): Request {
	const url = `https://roland.leth.ro/api/admin/indexnow?dryRun=${value}`

	return new Request(url, { method: "POST" })
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://roland.leth.ro")
	vi.stubEnv("INDEXNOW_KEY", KEY)
	vi.mocked(sitemap).mockResolvedValue([entry("https://roland.leth.ro/")])
	vi.mocked(submitToIndexNow).mockResolvedValue(okResult(1))
})

describe("POST /api/admin/indexnow", () => {
	it("submits every sitemap URL with the derived host and key location", async () => {
		vi.mocked(sitemap).mockResolvedValue([
			entry("https://roland.leth.ro/"),
			entry("https://roland.leth.ro/about"),
		])
		vi.mocked(submitToIndexNow).mockResolvedValue(okResult(2))

		const response = await POST(request())
		const body = await response.json()

		expect(response.status).toBe(200)
		expect(body.ok).toBe(true)
		expect(body.attempted).toBe(2)
		expect(body.accepted).toBe(2)
		expect(body.skipped).toEqual([])

		expect(submitToIndexNow).toHaveBeenCalledWith({
			key: KEY,
			keyLocation: "https://roland.leth.ro/indexnow-key.txt",
			host: "roland.leth.ro",
			urls: ["https://roland.leth.ro/", "https://roland.leth.ro/about"],
		})
	})

	it("503s when the key is not configured", async () => {
		// A deploy-config gap, not a bad request — same as `keepalive`'s 503 for a
		// missing Redis.
		vi.stubEnv("INDEXNOW_KEY", "")

		const response = await POST(request())

		expect(response.status).toBe(503)
		expect((await response.json()).error).toContain("INDEXNOW_KEY")
		expect(submitToIndexNow).not.toHaveBeenCalled()
	})

	it("503s with the actual constraint when the key is malformed", async () => {
		// Checked in the route, not the env schema: a bad value here must fail
		// only this action. `openssl rand -base64 32` is the likely source.
		vi.stubEnv("INDEXNOW_KEY", "Ab+c/dEf=")

		const response = await POST(request())
		const body = await response.json()

		expect(response.status).toBe(503)
		expect(body.error).toContain("malformed")
		expect(body.error).toContain("a-zA-Z0-9-")
		expect(submitToIndexNow).not.toHaveBeenCalled()
	})

	it("503s and never submits for a non-public origin", async () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000")

		const response = await POST(request())

		expect(response.status).toBe(503)
		expect((await response.json()).error).toContain("localhost:3000")
		expect(submitToIndexNow).not.toHaveBeenCalled()
	})

	it("skips off-host URLs and reports them without submitting them", async () => {
		vi.mocked(sitemap).mockResolvedValue([
			entry("https://roland.leth.ro/ok"),
			entry("https://evil.com/x"),
		])
		vi.mocked(submitToIndexNow).mockResolvedValue(okResult(1))

		const response = await POST(request())
		const body = await response.json()

		expect(response.status).toBe(200)
		expect(body.skipped).toEqual(["https://evil.com/x"])
		expect(submitToIndexNow).toHaveBeenCalledWith(
			expect.objectContaining({ urls: ["https://roland.leth.ro/ok"] })
		)
	})

	it("422s when no URL is submittable, naming what was excluded", async () => {
		vi.mocked(sitemap).mockResolvedValue([entry("https://evil.com/x")])

		const response = await POST(request())

		expect(response.status).toBe(422)
		expect((await response.json()).skipped).toEqual(["https://evil.com/x"])
		expect(submitToIndexNow).not.toHaveBeenCalled()
	})

	it("503s with a parseable body when the sitemap lookup fails", async () => {
		// Unguarded, this escapes as a framework 500 with no `{error}` field — a
		// shape the panel can't read, so the admin gets a blank failure.
		vi.mocked(sitemap).mockRejectedValue(new Error("db down"))

		const response = await POST(request())

		expect(response.status).toBe(503)
		expect((await response.json()).error).toMatch(/sitemap/i)
		expect(submitToIndexNow).not.toHaveBeenCalled()
	})

	it("500s with the config message when the site URL is unset", async () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "")
		vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "")

		const response = await POST(request())

		expect(response.status).toBe(500)
		expect((await response.json()).error).toBeTruthy()
		expect(submitToIndexNow).not.toHaveBeenCalled()
	})

	it("rethrows an unexpected site-URL error after logging it", async () => {
		// The catch handles `EnvConfigError` with a 500 body; anything else is
		// logged and rethrown rather than swallowed into a shapeless response.
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		const boom = new Error("unexpected")
		const siteUrlSpy = vi.spyOn(env, "getSiteUrl").mockImplementation(() => {
			throw boom
		})

		await expect(POST(request())).rejects.toBe(boom)
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("unexpected error resolving the site URL"),
			boom
		)
		expect(submitToIndexNow).not.toHaveBeenCalled()

		siteUrlSpy.mockRestore()
		errorSpy.mockRestore()
	})

	it("returns 502 when IndexNow rejects the submission", async () => {
		vi.mocked(submitToIndexNow).mockResolvedValue({
			ok: false,
			attempted: 1,
			accepted: 0,
			batches: [
				{
					status: 403,
					ok: false,
					message: "key not found",
					errorName: null,
					count: 1,
				},
			],
		})

		const response = await POST(request())
		const body = await response.json()

		expect(response.status).toBe(502)
		expect(body.ok).toBe(false)
		expect(body.batches[0].status).toBe(403)
	})

	it("reports accepted separately from attempted on a partial acceptance", async () => {
		// The operator must be able to tell "47 sent, 12 landed" from "47 landed";
		// reporting the attempt count as the outcome is how the former reads as
		// the latter.
		vi.mocked(submitToIndexNow).mockResolvedValue({
			ok: false,
			attempted: 4,
			accepted: 2,
			batches: [
				{ status: 200, ok: true, message: "", errorName: null, count: 2 },
				{
					status: 403,
					ok: false,
					message: "key not found",
					errorName: null,
					count: 2,
				},
			],
		})

		const response = await POST(request())
		const body = await response.json()

		expect(response.status).toBe(502)
		expect(body.attempted).toBe(4)
		expect(body.accepted).toBe(2)
	})

	it("logs each failed batch's errorName and message so a transport failure is diagnosable", async () => {
		// A transport failure reports `status: 0`; the status alone can't tell a
		// timeout from a network drop, so the log must carry the batch detail.
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		vi.mocked(submitToIndexNow).mockResolvedValue({
			ok: false,
			attempted: 1,
			accepted: 0,
			batches: [
				{
					status: 0,
					ok: false,
					message: "The operation timed out.",
					errorName: "TimeoutError",
					count: 1,
				},
			],
		})

		await POST(request())

		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("upstream-error"),
			expect.objectContaining({
				batches: [
					expect.objectContaining({
						status: 0,
						errorName: "TimeoutError",
						message: "The operation timed out.",
					}),
				],
			})
		)

		errorSpy.mockRestore()
	})

	it("includes the skipped list on the 502 upstream-rejection body", async () => {
		// The panel needs the off-host URLs even when the submission failed, so
		// `skipped` must ride along on the 502 the same way it does on a 200.
		vi.mocked(sitemap).mockResolvedValue([
			entry("https://roland.leth.ro/"),
			entry("https://example.com/off-host"),
		])
		vi.mocked(submitToIndexNow).mockResolvedValue({
			ok: false,
			attempted: 1,
			accepted: 0,
			batches: [
				{
					status: 403,
					ok: false,
					message: "key not found",
					errorName: null,
					count: 1,
				},
			],
		})

		const response = await POST(request())
		const body = await response.json()

		expect(response.status).toBe(502)
		expect(body.skipped).toEqual(["https://example.com/off-host"])
	})
})

// #region dry run

describe("POST /api/admin/indexnow?dryRun", () => {
	it("treats a bare flag as a preview", async () => {
		const body = await (await POST(requestWithDryRun(""))).json()

		expect(body.dryRun).toBe(true)
		expect(submitToIndexNow).not.toHaveBeenCalled()
	})

	it.each(["false", "0", "no", "off", "FALSE", " false "])(
		"submits for real when dryRun is explicitly %s",
		async (value) => {
			// Presence-only parsing would read these as "yes, preview" and hand back
			// a 200 the operator reads as a completed submission.
			const response = await POST(requestWithDryRun(value))
			const body = await response.json()

			expect(body.dryRun).toBeUndefined()
			expect(submitToIndexNow).toHaveBeenCalled()
		}
	)

	it.each(["true", "1", "yes"])(
		"previews when dryRun is explicitly %s",
		async (value) => {
			const body = await (await POST(requestWithDryRun(value))).json()

			expect(body.dryRun).toBe(true)
			expect(submitToIndexNow).not.toHaveBeenCalled()
		}
	)

	it("previews the on-host and excluded URLs without submitting", async () => {
		vi.mocked(sitemap).mockResolvedValue([
			entry("https://roland.leth.ro/ok"),
			entry("https://evil.com/x"),
		])

		const response = await POST(request(true))
		const body = await response.json()

		expect(response.status).toBe(200)
		expect(body.dryRun).toBe(true)
		expect(body.urls).toEqual(["https://roland.leth.ro/ok"])
		expect(body.skipped).toEqual(["https://evil.com/x"])
		expect(body.warnings).toEqual([])
		expect(submitToIndexNow).not.toHaveBeenCalled()
	})

	it("warns instead of failing when the key is missing, still listing URLs", async () => {
		vi.stubEnv("INDEXNOW_KEY", "")

		const response = await POST(request(true))
		const body = await response.json()

		expect(response.status).toBe(200)
		expect(body.urls).toEqual(["https://roland.leth.ro/"])
		expect(body.warnings.join(" ")).toContain("INDEXNOW_KEY")
		expect(submitToIndexNow).not.toHaveBeenCalled()
	})

	it("warns that a set-but-malformed key will fail a real submission", async () => {
		vi.stubEnv("INDEXNOW_KEY", "Ab+c/dEf=")

		const response = await POST(request(true))
		const body = await response.json()

		expect(response.status).toBe(200)
		expect(body.urls).toEqual(["https://roland.leth.ro/"])
		expect(body.warnings.join(" ")).toContain("malformed")
		expect(submitToIndexNow).not.toHaveBeenCalled()
	})

	it("warns when the origin is not public but still previews", async () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000")
		vi.mocked(sitemap).mockResolvedValue([entry("http://localhost:3000/")])

		const response = await POST(request(true))
		const body = await response.json()

		expect(response.status).toBe(200)
		expect(body.warnings.join(" ")).toContain("not public")
		expect(submitToIndexNow).not.toHaveBeenCalled()
	})
})

// #endregion
