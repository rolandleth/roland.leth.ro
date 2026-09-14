import { describe, expect, it } from "vitest"
import { buildGuideMarkdownFile } from "@/lib/content/guideMarkdown"
import { parseFrontmatter } from "@/lib/import/frontmatter"
import type { GuideDetail } from "@/lib/db/guides"

const BASE = "https://roland.leth.ro"

function makeGuide(overrides: Partial<GuideDetail> = {}): GuideDetail {
	return {
		id: 1,
		slug: "how-to-keep-a-decision-journal",
		title: "How to keep a decision journal",
		description: "What to write down before an outcome exists, and why.",
		body: "First paragraph.\n\nSecond paragraph.",
		projectSlug: "reckon",
		readingTime: "6 min read",
		publishedAt: new Date("2026-07-01T10:00:00.000Z"),
		updatedAt: new Date("2026-07-17T08:30:00.000Z"),
		topic: {
			slug: "making-better-decisions",
			title: "Making better decisions",
		},
		...overrides,
	}
}

describe("buildGuideMarkdownFile", () => {
	it("opens with a frontmatter block carrying title, slug, description and canonical", () => {
		const file = buildGuideMarkdownFile(makeGuide(), BASE)

		expect(file.startsWith("---\n")).toBe(true)
		expect(file).toContain('title: "How to keep a decision journal"')
		expect(file).toContain("slug: how-to-keep-a-decision-journal")
		expect(file).toContain(
			'description: "What to write down before an outcome exists, and why."'
		)
		expect(file).toContain(
			"canonical: https://roland.leth.ro/guides/how-to-keep-a-decision-journal"
		)
	})

	it("names the topic and project when the guide has them", () => {
		const file = buildGuideMarkdownFile(makeGuide(), BASE)

		expect(file).toContain("topic: making-better-decisions")
		expect(file).toContain("project: reckon")
	})

	it("omits the topic and project lines rather than emitting null for an ungrouped guide", () => {
		const file = buildGuideMarkdownFile(
			makeGuide({ topic: null, projectSlug: null }),
			BASE
		)

		expect(file).not.toContain("topic:")
		expect(file).not.toContain("project:")
		expect(file).not.toContain("null")
	})

	it("leads with the update date, the signal the page's dateline carries", () => {
		const file = buildGuideMarkdownFile(makeGuide(), BASE)

		expect(file).toContain("updated: 2026-07-17T08:30:00.000Z")
		expect(file).not.toContain("2026-07-01")
	})

	// `unstable_cache` round-trips Dates through JSON, so the builder can be
	// handed an ISO string where its type claims `Date`.
	it("normalizes an updatedAt handed back from the cache as a string", () => {
		const file = buildGuideMarkdownFile(
			makeGuide({ updatedAt: "2026-07-17T08:30:00.000Z" as unknown as Date }),
			BASE
		)

		expect(file).toContain("updated: 2026-07-17T08:30:00.000Z")
	})

	it("escapes quotes in the title and description so the YAML stays valid", () => {
		const file = buildGuideMarkdownFile(
			makeGuide({ title: 'The "good" parts', description: 'Say "no" more.' }),
			BASE
		)

		expect(file).toContain('title: "The \\"good\\" parts"')
		expect(file).toContain('description: "Say \\"no\\" more."')
	})

	it("emits the body verbatim after the block, so the post parser reads it back byte-for-byte", () => {
		const guide = makeGuide()
		const parsed = parseFrontmatter(buildGuideMarkdownFile(guide, BASE))

		expect(parsed.body).toBe(guide.body)
		expect(parsed.title).toBe(guide.title)
		expect(parsed.description).toBe(guide.description)
	})

	it("builds the canonical from the passed-in base", () => {
		const file = buildGuideMarkdownFile(
			makeGuide(),
			"https://preview.example.com"
		)

		expect(file).toContain(
			"canonical: https://preview.example.com/guides/how-to-keep-a-decision-journal"
		)
	})
})
