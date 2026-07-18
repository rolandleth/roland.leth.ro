import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/llms.txt/route"
import { getGuidesOverview } from "@/lib/db/guides"
import { getProjectsGalleryCached } from "@/lib/db/projects"
import { makeGuideListItem, makeGuideTopicSummary } from "@/test/fixtures"
import type { GuideTopicWithGuides } from "@/lib/db/guides"

vi.mock("@/lib/db/projects", () => ({
	getProjectsGalleryCached: vi.fn(),
}))

vi.mock("@/lib/db/guides", () => ({
	getGuidesOverview: vi.fn(),
}))

const BASE = "https://roland.leth.ro"

function topicStub(
	guides: GuideTopicWithGuides["guides"] = []
): GuideTopicWithGuides {
	return { ...makeGuideTopicSummary(), guides }
}

function projectStub(
	overrides: { name?: string; slug?: string; summary?: string } = {}
) {
	return {
		name: "Continuum",
		slug: "continuum",
		summary: "A habit tracker.",
		...overrides,
	}
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(getProjectsGalleryCached).mockResolvedValue([])
	vi.mocked(getGuidesOverview).mockResolvedValue({ topics: [], ungrouped: [] })
})

// #region Response

describe("llms.txt — response", () => {
	it("serves plain text", async () => {
		const response = await GET()
		expect(response.headers.get("Content-Type")).toBe(
			"text/plain; charset=utf-8"
		)
	})

	it("opens with the site heading and overview", async () => {
		const body = await (await GET()).text()
		expect(body).toContain("# Roland Leth")
		expect(body).toContain("roland.leth.ro")
	})

	it("links the tech blog, about, and sitemap", async () => {
		const body = await (await GET()).text()
		expect(body).toContain(`${BASE}/blog/tech`)
		expect(body).toContain(`${BASE}/about`)
		expect(body).toContain(`${BASE}/sitemap.xml`)
	})

	it("omits the life blog and tools links", async () => {
		const body = await (await GET()).text()
		expect(body).not.toContain(`${BASE}/blog/life`)
		expect(body).not.toContain(`${BASE}/tools/`)
	})
})

// #endregion

// #region Projects

describe("llms.txt — projects", () => {
	it("emits one line per project with name, link, and summary", async () => {
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			projectStub({
				name: "Reckon",
				slug: "reckon",
				summary: "A calorie tracker.",
			}) as never,
		])

		const body = await (await GET()).text()
		expect(body).toContain(
			`- [Reckon](${BASE}/projects/reckon): A calorie tracker.`
		)
	})

	it("collapses multi-line summaries onto a single line", async () => {
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			projectStub({ summary: "Line one.\n\nLine two." }) as never,
		])

		const body = await (await GET()).text()
		expect(body).toContain(
			`- [Continuum](${BASE}/projects/continuum): Line one. Line two.`
		)
	})

	it("uses NEXT_PUBLIC_SITE_URL for project links", async () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.example.com")
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			projectStub() as never,
		])

		const body = await (await GET()).text()
		expect(body).toContain("https://preview.example.com/projects/continuum")
	})
})

// #endregion

// #region Guides section

describe("llms.txt — guides", () => {
	it("omits the section entirely when there are no guides", async () => {
		const body = await (await GET()).text()
		expect(body).not.toContain("## Guides")
	})

	it("slots the section between Projects and Site", async () => {
		vi.mocked(getGuidesOverview).mockResolvedValue({
			topics: [],
			ungrouped: [makeGuideListItem()],
		})

		const body = await (await GET()).text()
		expect(body.indexOf("## Projects")).toBeLessThan(body.indexOf("## Guides"))
		expect(body.indexOf("## Guides")).toBeLessThan(body.indexOf("## Site"))
	})

	it("lists an ungrouped guide with its description", async () => {
		vi.mocked(getGuidesOverview).mockResolvedValue({
			topics: [],
			ungrouped: [makeGuideListItem()],
		})

		const body = await (await GET()).text()
		expect(body).toContain(
			`- [How to keep a decision journal](${BASE}/guides/how-to-keep-a-decision-journal): What to write down before an outcome exists, and why.`
		)
	})

	// The nesting is the only place the grouping is expressed to an agent —
	// every URL in the file is flat.
	it("nests a topic's guides beneath it", async () => {
		vi.mocked(getGuidesOverview).mockResolvedValue({
			topics: [topicStub([makeGuideListItem()])],
			ungrouped: [],
		})

		const body = await (await GET()).text()
		expect(body).toContain(
			`- [Making better decisions](${BASE}/guides/making-better-decisions): A method for judging your own calls honestly.`
		)
		expect(body).toContain(
			`  - [How to keep a decision journal](${BASE}/guides/how-to-keep-a-decision-journal):`
		)
	})

	it("lists topics before ungrouped guides", async () => {
		vi.mocked(getGuidesOverview).mockResolvedValue({
			topics: [topicStub()],
			ungrouped: [makeGuideListItem({ slug: "standalone" })],
		})

		const body = await (await GET()).text()
		expect(body.indexOf("/guides/making-better-decisions")).toBeLessThan(
			body.indexOf("/guides/standalone")
		)
	})

	it("collapses a multi-line description onto one line", async () => {
		vi.mocked(getGuidesOverview).mockResolvedValue({
			topics: [],
			ungrouped: [makeGuideListItem({ description: "Line one.\n\nLine two." })],
		})

		const body = await (await GET()).text()
		expect(body).toContain(
			`](${BASE}/guides/how-to-keep-a-decision-journal): Line one. Line two.`
		)
	})

	// A `]` in a title would close the markdown link label early and corrupt this
	// machine-parsed file, so labels are backslash-escaped.
	it("escapes markdown control characters in the link label", async () => {
		vi.mocked(getGuidesOverview).mockResolvedValue({
			topics: [],
			ungrouped: [
				makeGuideListItem({ title: "Arrays [and] brackets", slug: "arrays" }),
			],
		})

		const body = await (await GET()).text()
		expect(body).toContain(
			`- [Arrays \\[and\\] brackets](${BASE}/guides/arrays):`
		)
	})

	it("uses NEXT_PUBLIC_SITE_URL for guide links", async () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.example.com")
		vi.mocked(getGuidesOverview).mockResolvedValue({
			topics: [],
			ungrouped: [makeGuideListItem()],
		})

		const body = await (await GET()).text()
		expect(body).toContain(
			"https://preview.example.com/guides/how-to-keep-a-decision-journal"
		)
	})
})

// #endregion
