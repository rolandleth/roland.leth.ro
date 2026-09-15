import { beforeEach, describe, expect, it, vi } from "vitest"
import { getGuidesOverview, loadGuide } from "@/lib/db/guides"
import { makeGuideListItem, makeGuideTopicSummary } from "@/test/fixtures"
import { dynamic, generateStaticParams, GET } from "./route"
import * as mdRoute from "./route"
import type { GuideDetail } from "@/lib/db/guides"

vi.mock("@/lib/db/guides", async (importOriginal) => {
	// `allGuides` is a pure helper over the overview; keep the real one so the
	// static-params test exercises the actual grouping contract.
	const actual = (await importOriginal()) as Record<string, unknown>

	return {
		...actual,
		getGuidesOverview: vi.fn(),
		loadGuide: vi.fn(),
	}
})

function makeArgs(slug: string) {
	return [
		new Request(`http://localhost/api/guides/${slug}/md`),
		{ params: Promise.resolve({ slug }) },
	] as const
}

const guide: GuideDetail = {
	id: 1,
	slug: "how-to-keep-a-decision-journal",
	title: "How to keep a decision journal",
	description: "What to write down before an outcome exists, and why.",
	body: "First paragraph.\n\nSecond paragraph.",
	projectSlug: "reckon",
	readingTime: "6 min read",
	publishedAt: new Date("2026-07-01T10:00:00.000Z"),
	updatedAt: new Date("2026-07-17T08:30:00.000Z"),
	topic: { slug: "making-better-decisions", title: "Making better decisions" },
}

beforeEach(() => {
	vi.resetAllMocks()
})

describe("GET /api/guides/:slug/md", () => {
	it("404s whatever the page's own loader hides — unknown, draft, scheduled, topic hub", async () => {
		// The route asks `loadGuide`, the loader the guide page uses, so every
		// guard the page applies (published, past `publishedAt`, guides only) holds
		// here too. `null` from it is the one signal for all four cases.
		vi.mocked(loadGuide).mockResolvedValue(null)

		const response = await GET(...makeArgs("scheduled-one"))

		expect(loadGuide).toHaveBeenCalledWith("scheduled-one")
		expect(response.status).toBe(404)
		expect(response.headers.get("Content-Type")).toBe(
			"text/plain; charset=utf-8"
		)
	})

	it("returns 200 markdown with the frontmatter + body for a live guide", async () => {
		vi.mocked(loadGuide).mockResolvedValue(guide)

		const response = await GET(...makeArgs(guide.slug))

		expect(response.status).toBe(200)
		expect(response.headers.get("Content-Type")).toContain("text/markdown")

		const text = await response.text()
		expect(text).toContain('title: "How to keep a decision journal"')
		expect(text).toContain("topic: making-better-decisions")
		expect(text).toContain(
			"canonical: https://roland.leth.ro/guides/how-to-keep-a-decision-journal"
		)
		expect(text).toContain("First paragraph.\n\nSecond paragraph.")
	})

	it("sets no hand-rolled Cache-Control", async () => {
		// Freshness is the route cache's job, via the tags `getGuideBySlug` puts on
		// the entry — a hand-set `s-maxage` would outlive a tag bust on the CDN.
		vi.mocked(loadGuide).mockResolvedValue(guide)

		const response = await GET(...makeArgs(guide.slug))

		expect(response.headers.get("Cache-Control")).toBeNull()
	})
})

describe("static generation", () => {
	it("prerenders per guide with no time-based revalidate", () => {
		expect(dynamic).toBe("force-static")
		expect(mdRoute).not.toHaveProperty("revalidate")
	})

	it("generates a param per guide, grouped or not, and none for topic hubs", async () => {
		vi.mocked(getGuidesOverview).mockResolvedValue({
			topics: [
				{
					...makeGuideTopicSummary(),
					guides: [makeGuideListItem({ slug: "grouped" })],
				},
			],
			ungrouped: [makeGuideListItem({ slug: "standalone" })],
		})

		expect(await generateStaticParams()).toEqual([
			{ slug: "grouped" },
			{ slug: "standalone" },
		])
	})
})
