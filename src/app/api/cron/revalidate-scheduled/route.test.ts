import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	findGuidesBecameLive,
	revalidateGuideDetails,
	revalidateGuides,
} from "@/lib/db/guides"
import {
	findPostsBecameLive,
	revalidatePostDetails,
	revalidatePostSection,
} from "@/lib/db/posts"
import { SECTIONS } from "@/lib/db/sections"
import { GET } from "./route"

vi.mock("@/lib/db/posts", () => ({
	findPostsBecameLive: vi.fn(),
	revalidatePostDetails: vi.fn(),
	revalidatePostSection: vi.fn(),
}))

vi.mock("@/lib/db/guides", () => ({
	findGuidesBecameLive: vi.fn(),
	revalidateGuideDetails: vi.fn(),
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
	vi.mocked(findPostsBecameLive).mockResolvedValue([])
	vi.mocked(findGuidesBecameLive).mockResolvedValue([])
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

		expect(findPostsBecameLive).not.toHaveBeenCalled()
		expect(findGuidesBecameLive).not.toHaveBeenCalled()
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
		// span sections, and one due post doesn't say which sections are affected.
		vi.mocked(findPostsBecameLive).mockResolvedValue([
			{ section: "tech", slug: "one" },
		])

		const response = await GET(authorized())
		const data = await response.json()

		expect(data).toMatchObject({ revalidated: true, duePosts: 1 })

		for (const section of SECTIONS) {
			expect(revalidatePostSection).toHaveBeenCalledWith(section)
		}
	})

	it("busts the detail entries of exactly the posts that came due", async () => {
		// The section sweep above leaves `post-{section}-{slug}` untouched, and a
		// detail entry can be holding a 404 rendered while the post was still
		// future-dated. Without this the aggregates would list a post whose own
		// page and `.md` still 404'd.
		const due = [
			{ section: "tech" as const, slug: "one" },
			{ section: "life" as const, slug: "two" },
		]

		vi.mocked(findPostsBecameLive).mockResolvedValue(due)

		await GET(authorized())

		expect(revalidatePostDetails).toHaveBeenCalledWith(due)
	})

	it("does not bust post caches when only a guide came due", async () => {
		vi.mocked(findGuidesBecameLive).mockResolvedValue(["a", "b"])

		const response = await GET(authorized())
		const data = await response.json()

		expect(data).toMatchObject({ revalidated: true, dueGuides: 2 })
		expect(revalidateGuides).toHaveBeenCalled()
		expect(revalidateGuideDetails).toHaveBeenCalledWith(["a", "b"])
		expect(revalidatePostSection).not.toHaveBeenCalled()
		expect(revalidatePostDetails).not.toHaveBeenCalled()
	})

	it("busts both when a post and a guide came due in the same window", async () => {
		vi.mocked(findPostsBecameLive).mockResolvedValue([
			{ section: "tech", slug: "one" },
		])
		vi.mocked(findGuidesBecameLive).mockResolvedValue(["a"])

		await GET(authorized())

		expect(revalidatePostSection).toHaveBeenCalled()
		expect(revalidatePostDetails).toHaveBeenCalled()
		expect(revalidateGuides).toHaveBeenCalled()
		expect(revalidateGuideDetails).toHaveBeenCalled()
	})

	it("busts no detail tags when nothing came due", async () => {
		// The common path by a wide margin. A bust here would regenerate content
		// on every run, which is the cost this route was built to avoid.
		const response = await GET(authorized())
		const data = await response.json()

		expect(data).toMatchObject({ revalidated: false })
		expect(revalidatePostDetails).not.toHaveBeenCalled()
		expect(revalidateGuideDetails).not.toHaveBeenCalled()
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

		const [windowStart, now] = vi.mocked(findPostsBecameLive).mock.calls[0]
		const [guideWindowStart] = vi.mocked(findGuidesBecameLive).mock.calls[0]

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

		const [windowStart, now] = vi.mocked(findPostsBecameLive).mock.calls[0]

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
		vi.mocked(findPostsBecameLive).mockRejectedValue(new Error("DB down"))

		const response = await GET(authorized())

		expect(response.status).toBe(500)
		expect(revalidatePostSection).not.toHaveBeenCalled()
		expect(revalidateGuides).not.toHaveBeenCalled()
	})
})

// #endregion
