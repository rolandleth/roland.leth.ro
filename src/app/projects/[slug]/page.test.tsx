import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { loadProject } from "@/lib/db/projects"
import ProjectPage, { generateMetadata } from "./page"

vi.mock("@/lib/db/projects", async (importOriginal) => ({
	// Keep the real `resolveFeaturedImage` so the OG-image assertions exercise
	// the actual precedence; only the DB readers are faked.
	...(await importOriginal<typeof import("@/lib/db/projects")>()),
	getProjectsGalleryCached: vi.fn().mockResolvedValue([]),
	loadProject: vi.fn(),
}))

vi.mock("@/lib/content/markdown", () => ({
	markdownToReact: vi.fn().mockResolvedValue(null),
}))

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NOT_FOUND")
	}),
}))

vi.mock("@/components/projects/ProjectContent", () => ({
	default: function MockProjectContent() {
		return null
	},
}))

function paramsFor(slug: string) {
	return { params: Promise.resolve({ slug }) }
}

const existingProject = {
	id: 1,
	name: "My App",
	slug: "my-app",
	summary: "A project",
	bucket: PlatformBucket.iOS,
	platformTags: [PlatformTag.iOS],
	role: null,
	metaTitle: null,
	keywords: [],
	offers: null,
	applicationCategory: null,
	icon: null,
	cardImage: null,
	ogImage: null,
	heroImage: null,
	accentColor: null,
	isFeatured: false,
	isDiscontinued: false,
	date: null,
	sortOrder: 0,
	createdAt: new Date(),
	updatedAt: new Date(),
	sections: [],
	links: [],
	faqs: [],
}

beforeEach(() => {
	vi.resetAllMocks()
})

describe("ProjectPage", () => {
	it("calls notFound when the project does not exist", async () => {
		vi.mocked(loadProject).mockResolvedValue(null)
		await expect(ProjectPage(paramsFor("missing"))).rejects.toThrow("NOT_FOUND")
	})

	it("renders when the project exists", async () => {
		vi.mocked(loadProject).mockResolvedValue(existingProject)
		const result = await ProjectPage(paramsFor("my-app"))
		expect(result).toBeDefined()
	})
})

describe("ProjectPage — JSON-LD", () => {
	function ldScripts(container: HTMLElement) {
		return Array.from(
			container.querySelectorAll('script[type="application/ld+json"]')
		).map((s) => JSON.parse(s.innerHTML))
	}

	it("emits FAQPage + SoftwareApplication JSON-LD for an app with FAQs and offers", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			bucket: PlatformBucket.Mac,
			platformTags: [PlatformTag.macOS],
			offers: [
				{ name: "Monthly", price: "12.00", priceCurrency: "USD" },
				{ name: "Lifetime", price: "249.00", priceCurrency: "USD" },
			],
			faqs: [
				{
					id: 1,
					projectId: 1,
					question: "Is it private?",
					answer: "Yes, local-only.",
					sortOrder: 0,
				},
			],
		})

		const { container } = render(await ProjectPage(paramsFor("my-app")))
		const scripts = ldScripts(container)
		const types = scripts.map((s) => s["@type"])

		expect(types).toContain("FAQPage")
		expect(types).toContain("SoftwareApplication")

		const app = scripts.find((s) => s["@type"] === "SoftwareApplication")
		expect(app.operatingSystem).toBe("macOS")
		expect(app.offers).toMatchObject({ lowPrice: "12.00", highPrice: "249.00" })
	})

	it("omits both JSON-LD blocks for a Web project with no FAQs", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			bucket: PlatformBucket.Web,
			platformTags: [PlatformTag.Frontend],
			faqs: [],
		})

		const { container } = render(await ProjectPage(paramsFor("my-app")))
		expect(ldScripts(container)).toHaveLength(0)
	})
})

describe("generateMetadata", () => {
	it("returns empty metadata when the project does not exist (page itself can 404)", async () => {
		vi.mocked(loadProject).mockResolvedValue(null)
		const result = await generateMetadata(paramsFor("missing"))
		expect(result).toEqual({})
	})

	it("returns title metadata for a valid project", async () => {
		vi.mocked(loadProject).mockResolvedValue(existingProject)
		const result = await generateMetadata(paramsFor("my-app"))
		expect(result.title).toBe("My App")
	})

	it("uses metaTitle for the <title> when set (not the brand-word name)", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			metaTitle: "1:1 notes for managers (Mac)",
			keywords: ["1:1 notes app", "manager notes app"],
		})
		const result = await generateMetadata(paramsFor("my-app"))
		expect(result.title).toBe("1:1 notes for managers (Mac)")
		expect(result.keywords).toEqual(["1:1 notes app", "manager notes app"])
	})

	it("falls back to name for the <title> when metaTitle is null", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			metaTitle: null,
		})
		const result = await generateMetadata(paramsFor("my-app"))
		expect(result.title).toBe("My App")
	})

	it("uses the ogImage for OG, preferring it over the cardImage", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			ogImage: "/og.png",
			cardImage: "/card.png",
			heroImage: "/hero.png",
		})
		const result = await generateMetadata(paramsFor("my-app"))
		expect(result.openGraph?.images).toEqual(["/og.png"])
	})

	it("falls back to the cardImage for OG when no ogImage is set", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			ogImage: null,
			cardImage: "/card.png",
			heroImage: "/hero.png",
		})
		const result = await generateMetadata(paramsFor("my-app"))
		expect(result.openGraph?.images).toEqual(["/card.png"])
	})
})
