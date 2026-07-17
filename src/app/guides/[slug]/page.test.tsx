import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadGuide, loadGuideTopic } from "@/lib/db/guides"
import { loadProject } from "@/lib/db/projects"
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
	default: function MockPostMarkdownContent() {
		return null
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

// #region project CTA

describe("GuidePage — project link", () => {
	it("renders the related-project link for a guide that names one", async () => {
		vi.mocked(loadGuide).mockResolvedValue({ ...guide, projectSlug: "reckon" })
		vi.mocked(loadProject).mockResolvedValue(project)

		const { getByText } = render(await GuidePage(paramsFor(guide.slug)))

		expect(getByText("Reckon")).toBeInTheDocument()
	})

	it("renders no project link for a guide with no project", async () => {
		vi.mocked(loadGuide).mockResolvedValue(guide)

		const { queryByText } = render(await GuidePage(paramsFor(guide.slug)))

		expect(queryByText("Related project")).toBeNull()
		expect(loadProject).not.toHaveBeenCalled()
	})

	it("renders no project link when the named project no longer exists", async () => {
		vi.mocked(loadGuide).mockResolvedValue({ ...guide, projectSlug: "deleted" })
		vi.mocked(loadProject).mockResolvedValue(null)

		const { queryByText } = render(await GuidePage(paramsFor(guide.slug)))

		expect(queryByText("Related project")).toBeNull()
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

	it("ships no OG image for a guide with no project rather than a misleading one", async () => {
		vi.mocked(loadGuide).mockResolvedValue(guide)

		const result = await generateMetadata(paramsFor(guide.slug))
		const og = result.openGraph as { images?: string[] }

		expect(og.images).toBeUndefined()
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
					id: 1,
					slug: "making-better-decisions",
					title: "T",
					shortDescription: "S",
					projectSlug: null,
					updatedAt: new Date(),
					guides: [
						{
							id: 2,
							slug: "in-topic",
							title: "G",
							description: "D",
							projectSlug: null,
							sortOrder: 0,
							readingTime: null,
							updatedAt: new Date(),
						},
					],
				},
			],
			ungrouped: [
				{
					id: 3,
					slug: "standalone",
					title: "G2",
					description: "D2",
					projectSlug: null,
					sortOrder: 0,
					readingTime: null,
					updatedAt: new Date(),
				},
			],
		})

		expect(await generateStaticParams()).toEqual([
			{ slug: "making-better-decisions" },
			{ slug: "in-topic" },
			{ slug: "standalone" },
		])
	})
})

// #endregion
