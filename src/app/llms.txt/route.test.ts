import { beforeEach, describe, expect, it, vi } from "vitest"
import { dynamic, GET } from "@/app/llms.txt/route"
import * as llmsRoute from "@/app/llms.txt/route"
import { getGuidesOverview } from "@/lib/db/guides"
import { getRecentPosts } from "@/lib/db/posts"
import { getProjectsGalleryCached } from "@/lib/db/projects"
import { SECTION_DESCRIPTIONS } from "@/lib/db/sections"
import {
	makeGuideListItem,
	makeGuideTopicSummary,
	makeProjectGalleryItem,
} from "@/test/fixtures"
import type { GuideTopicWithGuides } from "@/lib/db/guides"
import type { RecentPost } from "@/lib/db/posts"
import type { ProjectGalleryItem } from "@/lib/db/projects"

vi.mock("@/lib/db/projects", () => ({
	getProjectsGalleryCached: vi.fn(),
}))

vi.mock("@/lib/db/guides", () => ({
	getGuidesOverview: vi.fn(),
}))

vi.mock("@/lib/db/posts", () => ({
	getRecentPosts: vi.fn(),
}))

const BASE = "https://roland.leth.ro"

function topicStub(
	guides: GuideTopicWithGuides["guides"] = []
): GuideTopicWithGuides {
	return { ...makeGuideTopicSummary(), guides }
}

// The shared fixture rather than a local cast: `as never` let the stub omit
// `isDiscontinued`, which is why the filter below had no coverage.
function projectStub(
	overrides: Partial<ProjectGalleryItem> = {}
): ProjectGalleryItem {
	return makeProjectGalleryItem({
		name: "Continuum",
		slug: "continuum",
		summary: "A habit tracker.",
		...overrides,
	})
}

function postStub(overrides: Partial<RecentPost> = {}): RecentPost {
	return {
		title: "Hello",
		slug: "hello",
		section: "tech",
		description: "A short description.",
		...overrides,
	}
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(getProjectsGalleryCached).mockResolvedValue([])
	vi.mocked(getGuidesOverview).mockResolvedValue({ topics: [], ungrouped: [] })
	vi.mocked(getRecentPosts).mockResolvedValue([])
})

// #region Response

describe("llms.txt — response", () => {
	it("serves plain text", async () => {
		const response = await GET()
		expect(response.headers.get("Content-Type")).toBe(
			"text/plain; charset=utf-8"
		)
	})

	it("sets no hand-rolled Cache-Control", async () => {
		// Freshness is the route cache's job, via the tags the three reads put on
		// the entry — a hand-set `s-maxage` would outlive a tag bust on the CDN.
		const response = await GET()

		expect(response.headers.get("Cache-Control")).toBeNull()
	})

	it("prerenders with no time-based revalidate", () => {
		expect(dynamic).toBe("force-static")
		expect(llmsRoute).not.toHaveProperty("revalidate")
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

	it("describes the tech blog with the line its list pages use", async () => {
		const body = await (await GET()).text()

		expect(body).toContain(
			`- [Tech blog](${BASE}/blog/tech): ${SECTION_DESCRIPTIONS.tech}`
		)
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
			}),
		])

		const body = await (await GET()).text()
		expect(body).toContain(
			`- [Reckon](${BASE}/projects/reckon): A calorie tracker.`
		)
	})

	it("collapses multi-line summaries onto a single line", async () => {
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			projectStub({ summary: "Line one.\n\nLine two." }),
		])

		const body = await (await GET()).text()
		expect(body).toContain(
			`- [Continuum](${BASE}/projects/continuum): Line one. Line two.`
		)
	})

	it("uses NEXT_PUBLIC_SITE_URL for project links", async () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.example.com")
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([projectStub()])

		const body = await (await GET()).text()
		expect(body).toContain("https://preview.example.com/projects/continuum")
	})

	it("leaves out a discontinued project", async () => {
		// The route's own comment makes this a correctness rule: an LLM must not
		// cite a dead app as current.
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			projectStub({ name: "Live", slug: "live" }),
			projectStub({ name: "Dead", slug: "dead", isDiscontinued: true }),
		])

		const body = await (await GET()).text()

		expect(body).toContain(`- [Live](${BASE}/projects/live)`)
		expect(body).not.toContain("Dead")
	})

	it("omits the whole section when every project is discontinued", async () => {
		// Matching the guides and posts blocks: a bare header advertises a section
		// that isn't there.
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			projectStub({ isDiscontinued: true }),
		])

		const body = await (await GET()).text()

		expect(body).not.toContain("## Projects")
	})

	it("omits the whole section when there are no projects at all", async () => {
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([])

		const body = await (await GET()).text()

		expect(body).not.toContain("## Projects")
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

	it("tells agents that guides, not topic hubs, serve raw markdown at `.md`", async () => {
		// The Posts intro says the same for posts; the guide `.md` route shipped
		// without a mention here.
		vi.mocked(getGuidesOverview).mockResolvedValue({
			topics: [],
			ungrouped: [makeGuideListItem()],
		})

		const body = await (await GET()).text()
		const guidesSection = body.slice(
			body.indexOf("## Guides"),
			body.indexOf("## Site")
		)

		expect(guidesSection).toContain(
			"Every guide serves its raw markdown at its URL with `.md` appended; topic hubs don't."
		)
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

// #region Posts section

describe("llms.txt — posts", () => {
	it("omits the section entirely when there are no posts", async () => {
		const body = await (await GET()).text()
		expect(body).not.toContain("## Posts")
	})

	it("reads the tech section only", async () => {
		await GET()
		expect(getRecentPosts).toHaveBeenCalledWith("tech")
		expect(getRecentPosts).toHaveBeenCalledTimes(1)
	})

	it("slots the section between Guides and Site", async () => {
		vi.mocked(getGuidesOverview).mockResolvedValue({
			topics: [],
			ungrouped: [makeGuideListItem()],
		})
		vi.mocked(getRecentPosts).mockResolvedValue([postStub()])

		const body = await (await GET()).text()
		expect(body.indexOf("## Guides")).toBeLessThan(body.indexOf("## Posts"))
		expect(body.indexOf("## Posts")).toBeLessThan(body.indexOf("## Site"))
	})

	it("lists a post with its canonical URL and description", async () => {
		vi.mocked(getRecentPosts).mockResolvedValue([postStub()])

		const body = await (await GET()).text()
		expect(body).toContain(
			`- [Hello](${BASE}/blog/tech/hello): A short description.`
		)
	})

	it("points at the archive for everything older than the list", async () => {
		vi.mocked(getRecentPosts).mockResolvedValue([postStub()])

		const body = await (await GET()).text()
		expect(body).toContain(`${BASE}/blog/tech/archive`)
	})

	it("collapses a multi-line description onto one line", async () => {
		vi.mocked(getRecentPosts).mockResolvedValue([
			postStub({ description: "Line one.\n\nLine two." }),
		])

		const body = await (await GET()).text()
		expect(body).toContain(`](${BASE}/blog/tech/hello): Line one. Line two.`)
	})

	it("escapes markdown control characters in the post title", async () => {
		vi.mocked(getRecentPosts).mockResolvedValue([
			postStub({ title: "[NJS] Routing", slug: "njs-routing" }),
		])

		const body = await (await GET()).text()
		expect(body).toContain(
			`- [\\[NJS\\] Routing](${BASE}/blog/tech/njs-routing):`
		)
	})
})

// #endregion
