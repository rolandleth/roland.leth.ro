import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	PlatformBucket,
	PlatformTag,
	ProjectPageLayout,
	ProjectProminence,
	ProjectSectionKind,
	ProjectStatus,
} from "@/generated/prisma/enums"
import { markdownToReact } from "@/lib/content/markdown"
import { ogImageEntry } from "@/lib/content/metadata"
import { getGuidesForProject } from "@/lib/db/guides"
import { loadProject } from "@/lib/db/projects"
import { EMPTY_PRODUCT_PAGE_FIELDS, textSectionFields } from "@/test/fixtures"
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

vi.mock("@/components/projects/product/ProductPage", () => ({
	default: function MockProductPage() {
		return <div data-testid="product-page" />
	},
}))

vi.mock("@/lib/db/guides", () => ({
	getGuidesForProject: vi.fn().mockResolvedValue({ topics: [], ungrouped: [] }),
}))

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NOT_FOUND")
	}),
}))

vi.mock("@/components/projects/ProjectContent", () => ({
	default: function MockProjectContent() {
		return <div data-testid="project-content" />
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
	prominence: ProjectProminence.low,
	pageLayout: ProjectPageLayout.portfolio,
	status: ProjectStatus.live,
	isOwnApp: false,
	...EMPTY_PRODUCT_PAGE_FIELDS,
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
	// `resetAllMocks` clears the factory's `mockResolvedValue`; without this the
	// page awaits `undefined` and destructuring the overview throws.
	vi.mocked(getGuidesForProject).mockResolvedValue({
		topics: [],
		ungrouped: [],
	})
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

	const stepsSection = {
		id: 10,
		projectId: 1,
		title: "How it works",
		description: "An intro.",
		sortOrder: 0,
		kind: ProjectSectionKind.steps,
		layout: null,
		images: [],
		items: [
			{
				id: 20,
				sectionId: 10,
				title: "Log a meal",
				description: "Type it.",
				sortOrder: 0,
				images: [],
			},
			{
				id: 21,
				sectionId: 10,
				title: "Then how you feel",
				description: "Log it.",
				sortOrder: 1,
				images: [],
			},
		],
	}

	it("renders the tabbed layout for the portfolio page layout, without steps", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			sections: [stepsSection],
		})

		const { getByTestId, queryByTestId } = render(
			await ProjectPage(paramsFor("my-app"))
		)

		expect(getByTestId("project-content")).toBeInTheDocument()
		expect(queryByTestId("product-page")).not.toBeInTheDocument()
		expect(markdownToReact).toHaveBeenCalledWith("An intro.")
		// The tabbed layout reads sections alone.
		expect(markdownToReact).not.toHaveBeenCalledWith("Type it.")
	})

	it("renders the product page for the product page layout, with every step's body", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			pageLayout: ProjectPageLayout.product,
			sections: [stepsSection],
		})

		const { getByTestId, queryByTestId } = render(
			await ProjectPage(paramsFor("my-app"))
		)

		expect(getByTestId("product-page")).toBeInTheDocument()
		expect(queryByTestId("project-content")).not.toBeInTheDocument()
		expect(markdownToReact).toHaveBeenCalledWith("An intro.")
		expect(markdownToReact).toHaveBeenCalledWith("Type it.")
		expect(markdownToReact).toHaveBeenCalledWith("Log it.")
	})

	it("picks the page by layout alone, whoever owns the project", async () => {
		vi.mocked(loadProject).mockResolvedValueOnce({
			...existingProject,
			pageLayout: ProjectPageLayout.product,
			isOwnApp: false,
		})
		const product = render(await ProjectPage(paramsFor("my-app")))

		expect(product.getByTestId("product-page")).toBeInTheDocument()
		product.unmount()

		vi.mocked(loadProject).mockResolvedValueOnce({
			...existingProject,
			pageLayout: ProjectPageLayout.portfolio,
			isOwnApp: true,
		})
		const portfolio = render(await ProjectPage(paramsFor("my-app")))

		expect(portfolio.getByTestId("project-content")).toBeInTheDocument()
		expect(portfolio.queryByTestId("product-page")).not.toBeInTheDocument()
	})

	it("shows the portfolio page for a layout it doesn't know, and logs it", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			// A database ahead of the deploy: a value this build has no case for.
			pageLayout: "magazine" as unknown as ProjectPageLayout,
		})

		const { getByTestId } = render(await ProjectPage(paramsFor("my-app")))

		expect(getByTestId("project-content")).toBeInTheDocument()
		expect(consoleError).toHaveBeenCalledWith(
			"[projects:page] unknown page layout, showing the portfolio page",
			{ slug: "my-app", pageLayout: "magazine" }
		)
		consoleError.mockRestore()
	})

	it("logs a step whose markdown fails to render, with its id", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
		vi.mocked(markdownToReact).mockImplementation(async (markdown) => {
			if (markdown === "Log it.") {
				throw new Error("bad step")
			}

			return null
		})
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			pageLayout: ProjectPageLayout.product,
			sections: [stepsSection],
		})

		await ProjectPage(paramsFor("my-app"))

		expect(consoleError).toHaveBeenCalledWith(
			"[ProjectPage] step markdown render failed",
			expect.objectContaining({
				projectSlug: "my-app",
				itemId: 21,
				reason: "bad step",
			})
		)
		consoleError.mockRestore()
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

	it("renders a fallback paragraph when one FAQ's markdown fails, without 500'ing the page", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			faqs: [
				{
					id: 1,
					projectId: 1,
					question: "First?",
					answer: "Good FAQ.",
					sortOrder: 0,
				},
				{
					id: 2,
					projectId: 1,
					question: "Second?",
					answer: "Broken FAQ raw answer.",
					sortOrder: 1,
				},
			],
		})
		// Only the second answer throws. The page must still render.
		vi.mocked(markdownToReact)
			.mockResolvedValueOnce(null)
			.mockRejectedValueOnce(new Error("parse failed"))
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

		const result = await ProjectPage(paramsFor("my-app"))
		const { container } = render(result)

		expect(container.textContent).toContain("Broken FAQ raw answer.")
		// Assert the structured payload, not just that it logged: a refactor that
		// drops or renames these fields would otherwise pass silently.
		expect(consoleError).toHaveBeenCalledWith(
			"[ProjectPage] FAQ markdown render failed",
			expect.objectContaining({
				projectSlug: "my-app",
				faqId: 2,
				reason: "parse failed",
			})
		)

		consoleError.mockRestore()
	})

	it("renders a fallback paragraph when one section's markdown fails, without 500'ing the page", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			sections: [
				{
					id: 10,
					projectId: 1,
					title: "Good",
					description: "Good section.",
					sortOrder: 0,
					...textSectionFields(),
					images: [],
				},
				{
					id: 11,
					projectId: 1,
					title: "Broken",
					description: "Broken section raw text.",
					sortOrder: 1,
					...textSectionFields(),
					images: [],
				},
			],
		})
		// Only the second section's markdown throws. Rendering must not reject —
		// the failed section falls back to a plain paragraph and the page survives.
		// (`ProjectContent` is mocked to null here, and section text lives in no
		// JSON-LD, so the structured log is what proves the fallback path ran.)
		vi.mocked(markdownToReact)
			.mockResolvedValueOnce(null)
			.mockRejectedValueOnce(new Error("section parse failed"))
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

		await expect(ProjectPage(paramsFor("my-app"))).resolves.toBeDefined()

		expect(consoleError).toHaveBeenCalledWith(
			"[ProjectPage] section markdown render failed",
			expect.objectContaining({
				projectSlug: "my-app",
				sectionId: 11,
				reason: "section parse failed",
			})
		)

		consoleError.mockRestore()
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

	it("uses metaDescription for the description when set, not the longer summary", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			summary: "A long hero paragraph that runs well past a result snippet.",
			metaDescription: "A short meta description.",
		})
		const result = await generateMetadata(paramsFor("my-app"))
		expect(result.description).toBe("A short meta description.")
	})

	it("falls back to the summary for the description when metaDescription is null", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			metaDescription: null,
		})
		const result = await generateMetadata(paramsFor("my-app"))
		expect(result.description).toBe("A project")
	})

	it("uses the ogImage for OG, preferring it over the cardImage", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			ogImage: "/og.png",
			cardImage: "/card.png",
			heroImage: "/hero.png",
		})
		const result = await generateMetadata(paramsFor("my-app"))
		expect(result.openGraph?.images).toEqual([ogImageEntry("/og.png")])
	})

	it("falls back to the cardImage for OG when no ogImage is set", async () => {
		vi.mocked(loadProject).mockResolvedValue({
			...existingProject,
			ogImage: null,
			cardImage: "/card.png",
			heroImage: "/hero.png",
		})
		const result = await generateMetadata(paramsFor("my-app"))
		expect(result.openGraph?.images).toEqual([ogImageEntry("/card.png")])
	})
})
