import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { defaultOgImage } from "@/lib/content/metadata"
import { loadGuide, loadGuideTopic } from "@/lib/db/guides"
import { loadProject } from "@/lib/db/projects"
import { makeGuideListItem, makeGuideTopicSummary } from "@/test/fixtures"
import GuidePage, { generateMetadata, generateStaticParams } from "./page"
import type { GuideDetail, GuideTopicDetail } from "@/lib/db/guides"
import type { ProjectDetail } from "@/lib/db/projects"

vi.mock("@/lib/db/guides", async (importOriginal) => {
	// `allGuides` is a pure helper over the overview; keep the real one so the
	// static-params test exercises the actual grouping contract.
	const actual = (await importOriginal()) as Record<string, unknown>

	return {
		...actual,
		getGuidesOverview: vi.fn().mockResolvedValue({ topics: [], ungrouped: [] }),
		loadGuide: vi.fn(),
		loadGuideTopic: vi.fn(),
	}
})

vi.mock("@/lib/db/projects", () => ({
	loadProject: vi.fn(),
	resolveOgImage: vi.fn(() => "https://blob.example/og.png"),
}))

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NOT_FOUND")
	}),
}))

vi.mock("@/components/blog/PostMarkdownContent", () => ({
	default: function MockPostMarkdownContent({ content }: { content: string }) {
		// Expose the content so tests can assert what got split where.
		return <div data-markdown>{content}</div>
	},
}))

vi.mock("@/components/guides/GuideContent", () => ({
	default: function MockGuideContent({
		children,
	}: {
		children: React.ReactNode
	}) {
		return <>{children}</>
	},
}))

function paramsFor(slug: string) {
	return { params: Promise.resolve({ slug }) }
}

const guide: GuideDetail = {
	id: 1,
	slug: "how-to-keep-a-decision-journal",
	title: "How to keep a decision journal",
	description: "What to write down before an outcome exists.",
	body: "Body.",
	projectSlug: null,
	readingTime: "6 min read",
	publishedAt: new Date("2026-07-01T10:00:00.000Z"),
	updatedAt: new Date("2026-07-17T08:30:00.000Z"),
	topic: null,
}

const topic: GuideTopicDetail = {
	id: 1,
	slug: "making-better-decisions",
	title: "Making better decisions",
	shortDescription: "A method for judging your own calls honestly.",
	description: "Hub body.",
	projectSlug: null,
	updatedAt: new Date("2026-07-17T08:30:00.000Z"),
	guides: [],
}

const project = {
	slug: "reckon",
	name: "Reckon",
	summary: "A decision journal.",
} as unknown as ProjectDetail

beforeEach(() => {
	vi.resetAllMocks()
})

// #region resolution

describe("GuidePage — slug resolution", () => {
	it("renders a guide when the slug names one", async () => {
		vi.mocked(loadGuide).mockResolvedValue(guide)

		expect(await GuidePage(paramsFor(guide.slug))).toBeDefined()
		expect(loadGuideTopic).not.toHaveBeenCalled()
	})

	it("falls back to a topic hub when no guide matches", async () => {
		vi.mocked(loadGuide).mockResolvedValue(null)
		vi.mocked(loadGuideTopic).mockResolvedValue(topic)

		expect(await GuidePage(paramsFor(topic.slug))).toBeDefined()
	})

	it("404s when the slug names neither", async () => {
		vi.mocked(loadGuide).mockResolvedValue(null)
		vi.mocked(loadGuideTopic).mockResolvedValue(null)

		await expect(GuidePage(paramsFor("missing"))).rejects.toThrow("NOT_FOUND")
	})

	// Cross-table uniqueness is enforced on write, so this is a tiebreak that
	// should never fire — pinned so a future resolution reorder is deliberate.
	it("prefers the guide when a slug somehow exists in both tables", async () => {
		vi.mocked(loadGuide).mockResolvedValue(guide)
		vi.mocked(loadGuideTopic).mockResolvedValue(topic)

		await GuidePage(paramsFor("collision"))

		expect(loadGuideTopic).not.toHaveBeenCalled()
	})
})

// #endregion

// #region JSON-LD

describe("GuidePage — JSON-LD", () => {
	it("emits Article JSON-LD for a guide", async () => {
		vi.mocked(loadGuide).mockResolvedValue(guide)

		const { container } = render(await GuidePage(paramsFor(guide.slug)))
		const script = container.querySelector('script[type="application/ld+json"]')
		const jsonLd = JSON.parse(script?.innerHTML ?? "{}")

		expect(jsonLd["@type"]).toBe("Article")
		expect(jsonLd.url).toBe(
			"https://roland.leth.ro/guides/how-to-keep-a-decision-journal"
		)
	})

	it("escapes a `</script>` payload in the title so it can't break out of the block", async () => {
		vi.mocked(loadGuide).mockResolvedValue({
			...guide,
			title: "Pwn</script><img src=x onerror=alert(1)>",
		})

		const { container } = render(await GuidePage(paramsFor(guide.slug)))
		const raw =
			container.querySelector('script[type="application/ld+json"]')
				?.innerHTML ?? ""

		expect(raw).not.toContain("</script>")
		expect(JSON.parse(raw).headline).toBe(
			"Pwn</script><img src=x onerror=alert(1)>"
		)
	})

	// The hub is a landing page, not an article; the plan scopes Article JSON-LD
	// to guides only.
	it("emits no JSON-LD for a topic hub", async () => {
		vi.mocked(loadGuide).mockResolvedValue(null)
		vi.mocked(loadGuideTopic).mockResolvedValue(topic)

		const { container } = render(await GuidePage(paramsFor(topic.slug)))

		expect(
			container.querySelector('script[type="application/ld+json"]')
		).toBeNull()
	})
})

// #endregion

// #region project chrome

describe("GuidePage — project chrome", () => {
	// The product link and its disclosure are authored prose in the body. The
	// page must render no card of its own: a boilerplate block repeated on every
	// guide is a weaker internal link than the in-content one, and — the reason
	// it went — never actually says who made the thing.
	it("renders no project card for a guide that names a project", async () => {
		vi.mocked(loadGuide).mockResolvedValue({ ...guide, projectSlug: "reckon" })
		vi.mocked(loadProject).mockResolvedValue(project)

		const { queryByText } = render(await GuidePage(paramsFor(guide.slug)))

		expect(queryByText("Related project")).toBeNull()
	})

	it("renders no project card on a topic hub", async () => {
		vi.mocked(loadGuide).mockResolvedValue(null)
		vi.mocked(loadGuideTopic).mockResolvedValue({
			...topic,
			projectSlug: "reckon",
		})
		vi.mocked(loadProject).mockResolvedValue(project)

		const { queryByText } = render(await GuidePage(paramsFor(topic.slug)))

		expect(queryByText("Related project")).toBeNull()
	})

	// The hub fetches no project at all now — only the guide page does, and only
	// for the JSON-LD image.
	it("does not fetch a project to render a topic hub", async () => {
		vi.mocked(loadGuide).mockResolvedValue(null)
		vi.mocked(loadGuideTopic).mockResolvedValue({
			...topic,
			projectSlug: "reckon",
		})

		await GuidePage(paramsFor(topic.slug))

		expect(loadProject).not.toHaveBeenCalled()
	})

	it("does not fetch a project for a guide that names none", async () => {
		vi.mocked(loadGuide).mockResolvedValue(guide)

		await GuidePage(paramsFor(guide.slug))

		expect(loadProject).not.toHaveBeenCalled()
	})
})

// #endregion

// #region topic hub body split

describe("GuidePage — topic hub body split", () => {
	function markdownBlocks(container: HTMLElement): string[] {
		return Array.from(container.querySelectorAll("[data-markdown]")).map(
			(node) => node.textContent ?? ""
		)
	}

	it("renders the framing above the list and the disclosure below it", async () => {
		vi.mocked(loadGuide).mockResolvedValue(null)
		vi.mocked(loadGuideTopic).mockResolvedValue({
			...topic,
			description:
				"Framing paragraph.\n\n---\n\nFull disclosure: I make Reckon.",
			guides: [makeGuideListItem({ slug: "a-guide" })],
		})

		const { container } = render(await GuidePage(paramsFor(topic.slug)))
		const blocks = markdownBlocks(container)

		// Two markdown blocks: intro then outro. The list sits between them in the
		// DOM, so the disclosure lands after it.
		expect(blocks).toEqual([
			"Framing paragraph.",
			"Full disclosure: I make Reckon.",
		])
	})

	it("renders a single framing block when the hub has no disclosure", async () => {
		vi.mocked(loadGuide).mockResolvedValue(null)
		vi.mocked(loadGuideTopic).mockResolvedValue({
			...topic,
			description: "Just framing.",
			guides: [makeGuideListItem({ slug: "a-guide" })],
		})

		const { container } = render(await GuidePage(paramsFor(topic.slug)))

		expect(markdownBlocks(container)).toEqual(["Just framing."])
	})
})

// #endregion

// #region generateMetadata

describe("generateMetadata", () => {
	it("returns empty metadata when the slug resolves to nothing", async () => {
		vi.mocked(loadGuide).mockResolvedValue(null)
		vi.mocked(loadGuideTopic).mockResolvedValue(null)

		expect(await generateMetadata(paramsFor("missing"))).toEqual({})
	})

	it("emits a canonical URL — these get shared with tracking params attached", async () => {
		vi.mocked(loadGuide).mockResolvedValue(guide)

		const result = await generateMetadata(paramsFor(guide.slug))

		expect(result.alternates?.canonical).toBe(
			"/guides/how-to-keep-a-decision-journal"
		)
	})

	it("emits article type with both published and modified times", async () => {
		vi.mocked(loadGuide).mockResolvedValue(guide)

		const result = await generateMetadata(paramsFor(guide.slug))
		const og = result.openGraph as {
			type?: string
			publishedTime?: string
			modifiedTime?: string
		}

		expect(og.type).toBe("article")
		expect(og.publishedTime).toBe("2026-07-01T10:00:00.000Z")
		expect(og.modifiedTime).toBe("2026-07-17T08:30:00.000Z")
	})

	it("omits publishedTime for a never-published guide", async () => {
		vi.mocked(loadGuide).mockResolvedValue({ ...guide, publishedAt: null })

		const result = await generateMetadata(paramsFor(guide.slug))
		const og = result.openGraph as { publishedTime?: string }

		expect(og.publishedTime).toBeUndefined()
	})

	it("describes a topic hub with its shortDescription", async () => {
		vi.mocked(loadGuide).mockResolvedValue(null)
		vi.mocked(loadGuideTopic).mockResolvedValue(topic)

		const result = await generateMetadata(paramsFor(topic.slug))

		expect(result.title).toBe("Making better decisions")
		expect(result.description).toBe(
			"A method for judging your own calls honestly."
		)
	})

	it("borrows the project's OG image for a guide that names one", async () => {
		vi.mocked(loadGuide).mockResolvedValue({ ...guide, projectSlug: "reckon" })
		vi.mocked(loadProject).mockResolvedValue(project)

		const result = await generateMetadata(paramsFor(guide.slug))
		const og = result.openGraph as { images?: string[] }

		expect(og.images).toEqual(["https://blob.example/og.png"])
	})

	// The guarantee is no misattribution, not no image: a guide that names no
	// project must never borrow a product's card. It falls back to the neutral
	// site-wide one, which claims nothing about a product.
	it("falls back to the site card for a guide with no project, never a product's", async () => {
		vi.mocked(loadGuide).mockResolvedValue(guide)

		const result = await generateMetadata(paramsFor(guide.slug))
		const og = result.openGraph as { images?: string[] }

		expect(og.images).toEqual([defaultOgImage])
		expect(og.images).not.toContain("https://blob.example/og.png")
	})
})

// #endregion

// #region generateStaticParams

describe("generateStaticParams", () => {
	it("prerenders every topic hub and every guide, grouped or not", async () => {
		const { getGuidesOverview } = await import("@/lib/db/guides")

		vi.mocked(getGuidesOverview).mockResolvedValue({
			topics: [
				{
					...makeGuideTopicSummary(),
					guides: [makeGuideListItem({ id: 2, slug: "in-topic" })],
				},
			],
			ungrouped: [makeGuideListItem({ id: 3, slug: "standalone" })],
		})

		expect(await generateStaticParams()).toEqual([
			{ slug: "making-better-decisions" },
			{ slug: "in-topic" },
			{ slug: "standalone" },
		])
	})
})

// #endregion
