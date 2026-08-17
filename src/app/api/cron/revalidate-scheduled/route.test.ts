import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	findGuidesBecameLive,
	revalidateAllGuides,
	revalidateGuideDetails,
	revalidateGuides,
} from "@/lib/db/guides"
import {
	findPostsBecameLive,
	revalidateAllPosts,
	revalidatePostDetails,
	revalidatePostSection,
} from "@/lib/db/posts"
import { SECTIONS } from "@/lib/db/sections"
import { currentDatetimeString } from "@/lib/utils/format"
import { GET } from "./route"

vi.mock("@/lib/db/posts", () => ({
	findPostsBecameLive: vi.fn(),
	revalidateAllPosts: vi.fn(),
	revalidatePostDetails: vi.fn(),
	revalidatePostSection: vi.fn(),
}))

vi.mock("@/lib/db/guides", () => ({
	findGuidesBecameLive: vi.fn(),
	revalidateAllGuides: vi.fn(),
	revalidateGuideDetails: vi.fn(),
	revalidateGuides: vi.fn(),
}))

/**
 * One more than `DUE_ROW_CAP` in the route. Not imported — a `route.ts` may only
 * export handlers and segment config, so the constant cannot be shared. Kept as
 * a named local so the coupling is visible if the cap ever moves.
 */
const OVER_CAP = 201

/**
 * Mirrors `WINDOW_HOURS` in the route, unimportable for the same reason.
 *
 * Restating it is the point here: this file asserts the window is exactly what
 * the route intends, so a change to the constant has to be made deliberately in
 * two places. Whether that number is still *correct* for the cron schedule is a
 * different question, and `../windowInvariant.test.ts` answers it by reading
 * both the route source and `vercel.json`.
 */
const WINDOW_HOURS = 50

function postRows(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		section: "tech" as const,
		slug: `post-${i}`,
	}))
}

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

	it("logs the slugs, not just the counts", async () => {
		// Their own comment calls these the one lever for tracing a stranded post
		// after the fact, and every other behaviour in this file is pinned. A
		// count alone tells you something came due, not which thing failed to
		// surface — which is the question asked during an incident.
		const info = vi.spyOn(console, "info").mockImplementation(() => {})

		vi.mocked(findPostsBecameLive).mockResolvedValue([
			{ section: "tech", slug: "one" },
			{ section: "life", slug: "two" },
		])
		vi.mocked(findGuidesBecameLive).mockResolvedValue(["a-guide"])

		await GET(authorized())

		expect(info).toHaveBeenCalledWith(
			expect.stringContaining("revalidated for due content"),
			expect.objectContaining({
				duePostSlugs: ["tech/one", "life/two"],
				dueGuideSlugs: ["a-guide"],
			})
		)
	})

	it("replaces the slug lists with a marker when a half overflowed", async () => {
		// Hundreds of slugs would bury the line, and the blanket bust makes
		// "which ones" moot — but the line must say that is what happened rather
		// than silently reporting an empty list.
		const info = vi.spyOn(console, "info").mockImplementation(() => {})

		vi.mocked(findPostsBecameLive).mockResolvedValue(postRows(OVER_CAP))

		await GET(authorized())

		expect(info).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				duePostSlugs: expect.stringContaining("over cap"),
				duePosts: OVER_CAP,
			})
		)
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
	it("looks back exactly WINDOW_HOURS", async () => {
		// This did not test the window. `windowStart < now` is a trivially-passing
		// lexicographic compare, and the old `> 25h` bound accepted any value from
		// 26 upward while the constant was 49 — the one number the whole design
		// hinges on, unlocked. Fake timers pin the instant so the bound can be
		// asserted to the millisecond.
		//
		// The relation between this number and the cron schedule is a separate
		// concern, guarded in `windowInvariant.test.ts`.
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-08-15T10:00:00Z"))

		try {
			await GET(authorized())

			const [guideWindowStart, guideNow] =
				vi.mocked(findGuidesBecameLive).mock.calls[0]
			const spannedHours =
				(guideNow.getTime() - guideWindowStart.getTime()) / (60 * 60 * 1000)

			expect(spannedHours).toBe(WINDOW_HOURS)
		} finally {
			vi.useRealTimers()
		}
	})

	it("ends the window at now, not in the future", async () => {
		// The upper bound is `now` and the compare is `lte`, so a post dated
		// exactly at this instant counts as due. Drifting it forward would surface
		// scheduled content ahead of its date, which is the one thing the cron
		// must never do.
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-08-15T10:00:00Z"))

		try {
			await GET(authorized())

			const [, guideNow] = vi.mocked(findGuidesBecameLive).mock.calls[0]

			expect(guideNow.getTime()).toBe(Date.now())
		} finally {
			vi.useRealTimers()
		}
	})

	it("closes both windows at the same instant", async () => {
		// One clock read for the run. This used to be three, so the post window
		// and the guide window ended at different moments and the two halves of a
		// single run disagreed about "now" — content landing in the gap was
		// counted by one half and missed by the other.
		await GET(authorized())

		const [postStart, postNow] = vi.mocked(findPostsBecameLive).mock.calls[0]
		const [guideStart, guideNow] = vi.mocked(findGuidesBecameLive).mock.calls[0]

		// The halves take different types — a wall-clock string for the post
		// column, a real Date for the guide column — so the comparison runs
		// through the same formatter the route uses.
		expect(postNow).toBe(currentDatetimeString(guideNow))
		expect(postStart).toBe(currentDatetimeString(guideStart))
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

	it("500s when only the guide check fails", async () => {
		// The guide half was never exercised: under `Promise.all` a single
		// rejection was indistinguishable from either side, so this path could
		// break without a test noticing.
		vi.spyOn(console, "error").mockImplementation(() => {})
		vi.mocked(findGuidesBecameLive).mockRejectedValue(new Error("DB down"))

		const response = await GET(authorized())

		expect(response.status).toBe(500)
	})

	it("still revalidates the half that succeeded", async () => {
		// The reason for `allSettled`. Under `all`, a transient guide-side failure
		// threw away a good post result and revalidated nothing, so a post that
		// came due stayed invisible until the next day's run — for a fault that
		// had nothing to do with posts.
		vi.spyOn(console, "error").mockImplementation(() => {})
		vi.spyOn(console, "info").mockImplementation(() => {})
		vi.mocked(findPostsBecameLive).mockResolvedValue([
			{ section: "tech", slug: "one" },
		])
		vi.mocked(findGuidesBecameLive).mockRejectedValue(new Error("DB down"))

		const response = await GET(authorized())

		expect(revalidatePostDetails).toHaveBeenCalledWith([
			{ section: "tech", slug: "one" },
		])
		// Partial work, but the run is still failed — otherwise a persistent
		// guide-side outage hides behind a healthy post side forever.
		expect(response.status).toBe(500)
	})

	it("names which half failed in the error log", async () => {
		// A cron that 500s tells you nothing about where to look. Under `all` the
		// line carried one opaque error and no `now`, so the window could not be
		// reconstructed after the fact.
		const error = vi.spyOn(console, "error").mockImplementation(() => {})

		vi.mocked(findGuidesBecameLive).mockRejectedValue(new Error("DB down"))

		await GET(authorized())

		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("due-content check failed"),
			expect.objectContaining({
				postsFailed: false,
				guidesFailed: true,
				windowStart: expect.any(String),
				now: expect.any(String),
			})
		)
	})

	it("returns a requestId that matches the logged line", async () => {
		// The contract `respondInternalError` gives every other 500 on the site:
		// the id in the body is the id in the log, so a failed run can be found.
		const error = vi.spyOn(console, "error").mockImplementation(() => {})

		vi.mocked(findPostsBecameLive).mockRejectedValue(new Error("DB down"))

		const response = await GET(authorized())
		const data = await response.json()
		const logged = error.mock.calls[0][1] as { requestId: string }

		expect(data.requestId).toEqual(expect.any(String))
		expect(data.requestId).toBe(logged.requestId)
	})
})

// #endregion

// #region Row cap

describe("GET /api/cron/revalidate-scheduled — due-row cap", () => {
	beforeEach(() => {
		vi.spyOn(console, "info").mockImplementation(() => {})
	})

	it("busts per post while under the cap", async () => {
		vi.mocked(findPostsBecameLive).mockResolvedValue(postRows(3))

		await GET(authorized())

		expect(revalidatePostDetails).toHaveBeenCalled()
		expect(revalidateAllPosts).not.toHaveBeenCalled()
	})

	it("falls back to a blanket post bust over the cap", async () => {
		// The switch, not a limit: past the cap the per-row path is slower AND
		// less complete than one `post-pages` bust, because the query stopped
		// returning rows at the cap. Blanket covers the ones it never saw.
		vi.mocked(findPostsBecameLive).mockResolvedValue(postRows(OVER_CAP))

		const response = await GET(authorized())

		expect(revalidateAllPosts).toHaveBeenCalled()
		expect(revalidatePostDetails).not.toHaveBeenCalled()
		expect(response.status).toBe(200)
	})

	it("falls back to a blanket guide bust over the cap", async () => {
		vi.mocked(findGuidesBecameLive).mockResolvedValue(
			Array.from({ length: OVER_CAP }, (_, i) => `guide-${i}`)
		)

		await GET(authorized())

		expect(revalidateAllGuides).toHaveBeenCalled()
		expect(revalidateGuideDetails).not.toHaveBeenCalled()
	})

	it("caps each half independently", async () => {
		// One oversized import shouldn't drag the other half onto the blunt path.
		vi.mocked(findPostsBecameLive).mockResolvedValue(postRows(OVER_CAP))
		vi.mocked(findGuidesBecameLive).mockResolvedValue(["a"])

		await GET(authorized())

		expect(revalidateAllPosts).toHaveBeenCalled()
		expect(revalidateAllGuides).not.toHaveBeenCalled()
		expect(revalidateGuideDetails).toHaveBeenCalledWith(["a"])
	})

	it("asks for one row more than it will process individually", async () => {
		// How the route tells "exactly at the cap" from "over it" without a
		// second count query. If the limit equalled the cap, a full page would
		// read as under it and the overflow branch would be unreachable.
		await GET(authorized())

		const [, , postLimit] = vi.mocked(findPostsBecameLive).mock.calls[0]
		const [, , guideLimit] = vi.mocked(findGuidesBecameLive).mock.calls[0]

		expect(postLimit).toBe(OVER_CAP)
		expect(guideLimit).toBe(OVER_CAP)
	})
})

// #endregion
