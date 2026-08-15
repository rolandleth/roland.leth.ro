import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { countGuidesBecameLive, revalidateGuides } from "@/lib/db/guides"
import { countPostsBecameLive, revalidatePostSection } from "@/lib/db/posts"
import { SECTIONS } from "@/lib/db/sections"
import { GET } from "./route"

vi.mock("@/lib/db/posts", () => ({
	countPostsBecameLive: vi.fn(),
	revalidatePostSection: vi.fn(),
}))

vi.mock("@/lib/db/guides", () => ({
	countGuidesBecameLive: vi.fn(),
	revalidateGuides: vi.fn(),
}))

function makeRequest(authorization?: string): NextRequest {
	const headers = new Headers()

	if (authorization !== undefined) {
		headers.set("authorization", authorization)
	}

	return new NextRequest("http://localhost/api/cron/revalidate-scheduled", {
		headers,
	})
}

function authorized() {
	return makeRequest("Bearer test-secret")
}

beforeEach(() => {
	vi.stubEnv("CRON_SECRET", "test-secret")
	vi.mocked(countPostsBecameLive).mockResolvedValue(0)
	vi.mocked(countGuidesBecameLive).mockResolvedValue(0)
})

afterEach(() => {
	vi.unstubAllEnvs()
	vi.clearAllMocks()
})

// #region Auth guard

describe("GET /api/cron/revalidate-scheduled — auth guard", () => {
	it.each([
		["no header", undefined],
		["wrong secret", "Bearer nope"],
		["missing Bearer prefix", "test-secret"],
	])("returns 401 for %s", async (_label, authorization) => {
		const response = await GET(makeRequest(authorization))

		expect(response.status).toBe(401)
	})

	it("returns 401 without naming the env var when CRON_SECRET is unset", async () => {
		// Same contract as the ping route: a pre-auth probe must not learn the
		// server is missing CRON_SECRET.
		vi.stubEnv("CRON_SECRET", "")

		const response = await GET(authorized())
		const data = await response.json()

		expect(response.status).toBe(401)
		expect(data.error).toBe("Unauthorized")
	})

	it("does not query the database before authorizing", async () => {
		// The count is cheap but the route is public; an unauthenticated caller
		// must not be able to drive DB load by hammering it.
		await GET(makeRequest())

		expect(countPostsBecameLive).not.toHaveBeenCalled()
		expect(countGuidesBecameLive).not.toHaveBeenCalled()
	})
})

// #endregion

// #region No-op path

describe("GET /api/cron/revalidate-scheduled — nothing due", () => {
	it("does not revalidate when neither posts nor guides came due", async () => {
		// The common case. Busting here would defeat the entire point of the
		// route: it exists so the feed, archive, and sitemap stop regenerating
		// every hour regardless of whether anything changed.
		const response = await GET(authorized())
		const data = await response.json()

		expect(response.status).toBe(200)
		expect(data).toMatchObject({
			revalidated: false,
			duePosts: 0,
			dueGuides: 0,
		})
		expect(revalidatePostSection).not.toHaveBeenCalled()
		expect(revalidateGuides).not.toHaveBeenCalled()
	})

	it("logs a heartbeat even when nothing came due", async () => {
		// Silence on the happy path would make "nothing due" look identical to
		// "this cron stopped running". With the `revalidate` backstop gone, a
		// silently dead cron strands every scheduled post indefinitely, so the
		// no-op run has to leave a trace to grep for.
		const info = vi.spyOn(console, "info").mockImplementation(() => {})

		await GET(authorized())

		expect(info).toHaveBeenCalledWith(
			expect.stringContaining("nothing due"),
			expect.anything()
		)
	})
})

// #endregion

// #region Revalidation

describe("GET /api/cron/revalidate-scheduled — content came due", () => {
	it("busts every section when a post came due", async () => {
		// Section-agnostic on purpose: the `posts` aggregate and the sitemap
		// span sections, and the count doesn't say which section is affected.
		vi.mocked(countPostsBecameLive).mockResolvedValue(1)

		const response = await GET(authorized())
		const data = await response.json()

		expect(data).toMatchObject({ revalidated: true, duePosts: 1 })

		for (const section of SECTIONS) {
			expect(revalidatePostSection).toHaveBeenCalledWith(section)
		}
	})

	it("does not bust post caches when only a guide came due", async () => {
		vi.mocked(countGuidesBecameLive).mockResolvedValue(2)

		const response = await GET(authorized())
		const data = await response.json()

		expect(data).toMatchObject({ revalidated: true, dueGuides: 2 })
		expect(revalidateGuides).toHaveBeenCalled()
		expect(revalidatePostSection).not.toHaveBeenCalled()
	})

	it("busts both when a post and a guide came due in the same window", async () => {
		vi.mocked(countPostsBecameLive).mockResolvedValue(1)
		vi.mocked(countGuidesBecameLive).mockResolvedValue(1)

		await GET(authorized())

		expect(revalidatePostSection).toHaveBeenCalled()
		expect(revalidateGuides).toHaveBeenCalled()
	})
})

// #endregion

// #region Window

describe("GET /api/cron/revalidate-scheduled — lookback window", () => {
	it("looks back further than the widest gap between two runs", async () => {
		// A window equal to the interval strands a post whenever a run is
		// skipped or delayed. Overlap costs one redundant revalidation; a gap
		// loses the post until the next real mutation, so the window must be
		// strictly wider than the schedule in `vercel.json` — and that schedule
		// is daily, fired with ±59 minutes of Hobby jitter, so two consecutive
		// runs can land 24h59m apart with nothing wrong.
		await GET(authorized())

		const [windowStart, now] = vi.mocked(countPostsBecameLive).mock.calls[0]
		const [guideWindowStart] = vi.mocked(countGuidesBecameLive).mock.calls[0]

		expect(windowStart < now).toBe(true)
		expect(Date.now() - guideWindowStart.getTime()).toBeGreaterThan(
			25 * 60 * 60 * 1000
		)
	})

	it("passes the post window as yyyy-MM-dd-HHmm strings", async () => {
		// `Post.datetime` is a fixed-width string column, not a DateTime. The
		// lexicographic compare only matches chronological order in that exact
		// format.
		await GET(authorized())

		const [windowStart, now] = vi.mocked(countPostsBecameLive).mock.calls[0]

		expect(windowStart).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}$/)
		expect(now).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}$/)
	})
})

// #endregion

// #region Failure

describe("GET /api/cron/revalidate-scheduled — check failure", () => {
	it("500s rather than reporting a silent success", async () => {
		// A failed check means scheduled content stops surfacing and nothing
		// else notices. The run must be visible as failed in Vercel's cron log.
		vi.spyOn(console, "error").mockImplementation(() => {})
		vi.mocked(countPostsBecameLive).mockRejectedValue(new Error("DB down"))

		const response = await GET(authorized())

		expect(response.status).toBe(500)
		expect(revalidatePostSection).not.toHaveBeenCalled()
		expect(revalidateGuides).not.toHaveBeenCalled()
	})
})

// #endregion
