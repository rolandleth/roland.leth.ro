import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "@/app/api/admin/indexnow/route"
import sitemap from "@/app/sitemap"
import { submitToIndexNow } from "@/lib/content/indexnow"
import type { IndexNowResult } from "@/lib/content/indexnow"
import type { MetadataRoute } from "next"

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

function okResult(submitted: number): IndexNowResult {
	return {
		ok: true,
		submitted,
		batches: [{ status: 200, ok: true, message: "", count: submitted }],
	}
}

/** POST request to the route; `dryRun` adds the preview-only query flag. */
function request(dryRun = false): Request {
	const url = `https://roland.leth.ro/api/admin/indexnow${dryRun ? "?dryRun" : ""}`

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
		expect(body.submitted).toBe(2)
		expect(body.skipped).toEqual([])

		expect(submitToIndexNow).toHaveBeenCalledWith({
			key: KEY,
			keyLocation: "https://roland.leth.ro/indexnow-key.txt",
			host: "roland.leth.ro",
			urls: ["https://roland.leth.ro/", "https://roland.leth.ro/about"],
		})
	})

	it("400s when the key is not configured", async () => {
		vi.stubEnv("INDEXNOW_KEY", "")

		const response = await POST(request())

		expect(response.status).toBe(400)
		expect((await response.json()).error).toContain("INDEXNOW_KEY")
		expect(submitToIndexNow).not.toHaveBeenCalled()
	})

	it("400s and never submits for a non-public origin", async () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000")

		const response = await POST(request())

		expect(response.status).toBe(400)
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

	it("400s when no URL is submittable", async () => {
		vi.mocked(sitemap).mockResolvedValue([entry("https://evil.com/x")])

		const response = await POST(request())

		expect(response.status).toBe(400)
		expect(submitToIndexNow).not.toHaveBeenCalled()
	})

	it("returns 502 when IndexNow rejects the submission", async () => {
		vi.mocked(submitToIndexNow).mockResolvedValue({
			ok: false,
			submitted: 1,
			batches: [{ status: 403, ok: false, message: "key not found", count: 1 }],
		})

		const response = await POST(request())
		const body = await response.json()

		expect(response.status).toBe(502)
		expect(body.ok).toBe(false)
		expect(body.batches[0].status).toBe(403)
	})
})

// #region dry run

describe("POST /api/admin/indexnow?dryRun", () => {
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
