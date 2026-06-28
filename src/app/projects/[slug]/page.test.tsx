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
