import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TEXT_BESIDE_IMAGE_COLUMNS_CLASS } from "@/components/projects/gallery/galleryLayout"
import {
	PlatformBucket,
	PlatformTag,
	ProjectProminence,
} from "@/generated/prisma/enums"
import { getProjectsGalleryCached } from "@/lib/db/projects"
import { makeProjectGalleryItem } from "@/test/fixtures"
import { setupUser } from "@/test/user"
import ProjectsPage, { metadata } from "./page"
import type { ProjectGalleryItem } from "@/lib/db/projects"

vi.mock("@/lib/db/projects", () => ({
	getProjectsGalleryCached: vi.fn(),
}))

const user = setupUser()

beforeEach(() => {
	vi.resetAllMocks()
})

async function renderGallery(projects: ProjectGalleryItem[]) {
	vi.mocked(getProjectsGalleryCached).mockResolvedValue(projects)

	return render(await ProjectsPage())
}

/** A gallery section with no visible heading, by its screen-reader name. */
function sectionNamed(name: string): HTMLElement {
	return screen.getByRole("region", { name })
}

/** The `article` a tile's or card's `h2` sits in. */
function articleTitled(name: RegExp | string): HTMLElement {
	return screen
		.getByRole("heading", { level: 2, name })
		.closest("article") as HTMLElement
}

function moreProjects(): HTMLElement {
	return document.getElementById("more-projects") as HTMLElement
}

const appStoreLink = (id: number) => ({
	id,
	label: "App Store",
	url: `https://apps.apple.com/app/id${id}`,
})

/** A high-prominence own app on a product page, as Reckon is. */
function makeApp(
	name: string,
	overrides: Partial<ProjectGalleryItem> = {}
): ProjectGalleryItem {
	const slug = name.toLowerCase()

	return makeProjectGalleryItem({
		name,
		slug,
		// An icon, as an own app has: without one, the fallback letter would join
		// the heading's text.
		icon: `/${slug}.png`,
		prominence: ProjectProminence.high,
		isOwnApp: true,
		summary: `${name} summary.`,
		heroEyebrow: `${name} eyebrow`,
		heroHeadline: `${name} headline`,
		productHeroImage: `/${slug}-hero.png`,
		links: [appStoreLink(name.length)],
		...overrides,
	})
}

/** A medium-prominence project, as client work is. */
function makeCardProject(
	name: string,
	overrides: Partial<ProjectGalleryItem> = {}
): ProjectGalleryItem {
	return makeProjectGalleryItem({
		name,
		slug: name.toLowerCase(),
		icon: `/${name.toLowerCase()}.png`,
		prominence: ProjectProminence.medium,
		...overrides,
	})
}

const theme = {
	band: "#f3ede4",
	bandInk: "#2a241e",
	bandInk2: "#6b6158",
	bandHighlight: "#9a532b",
	accentText: "#9a532b",
}
const darkTheme = { ...theme, band: "#2a211b", bandInk: "#f3ede4" }

// #region Metadata

describe("ProjectsPage — metadata", () => {
	it("titles the page Projects", () => {
		expect(metadata.title).toBe("Projects")
	})

	it("identifies the page at /projects", () => {
		// `buildPageMetadata` only sets `alternates.canonical` when a caller
		// passes `canonicalPath` separately from `path` — this page doesn't, so
		// `path` surfaces via `openGraph.url` instead.
		expect(metadata.openGraph?.url).toBe("/projects")
	})
})

// #endregion

// #region Sections

describe("ProjectsPage — sections", () => {
	it("renders only the title with no projects", async () => {
		await renderGallery([])

		expect(
			screen.getByRole("heading", { level: 1, name: "Projects" })
		).toBeInTheDocument()
		expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0)
	})

	it("puts high prominence in the tiles, medium in the cards, and low under More projects", async () => {
		await renderGallery([
			makeApp("Reckon"),
			makeCardProject("MyTherme"),
			makeProjectGalleryItem({
				name: "Body Tracking",
				slug: "body-tracking",
				prominence: ProjectProminence.low,
				isOwnApp: true,
			}),
		])

		// A lone tile is wide: its heading carries the eyebrow and headline.
		expect(
			within(sectionNamed("Featured projects")).getByRole("heading", {
				name: /^Reckon/,
			})
		).toBeInTheDocument()
		expect(
			within(sectionNamed("Selected projects")).getByRole("heading", {
				level: 2,
				name: "MyTherme",
			})
		).toBeInTheDocument()

		// Closed, the list is inert and hidden from the accessibility tree; its
		// links are in the HTML all the same.
		expect(
			within(moreProjects()).getByRole("link", {
				name: "Body Tracking",
				hidden: true,
			})
		).toHaveAttribute("href", "/projects/body-tracking")
		// Each project in one place only: the tiles and cards aren't listed again.
		expect(within(moreProjects()).queryByText("MyTherme")).toBeNull()
		expect(within(moreProjects()).queryByText("Reckon")).toBeNull()
	})

	it("lists a discontinued project under More projects, faded, whatever its prominence", async () => {
		await renderGallery([
			makeApp("Reckon", { isDiscontinued: true }),
			makeCardProject("MyTherme", { isDiscontinued: true }),
		])

		expect(
			screen.queryByRole("region", { name: "Featured projects" })
		).not.toBeInTheDocument()
		expect(
			screen.queryByRole("region", { name: "Selected projects" })
		).not.toBeInTheDocument()

		const reckon = within(moreProjects()).getByRole("link", {
			name: "Reckon",
			hidden: true,
		})
		expect(reckon.querySelector("img")).toHaveClass("grayscale")
		expect(
			within(moreProjects()).getByRole("link", {
				name: "MyTherme",
				hidden: true,
			})
		).toBeInTheDocument()
	})

	// The gallery item doesn't carry the page layout at all: placement can't
	// depend on it.
	it("places by prominence alone: client work can be a tile, an own app an icon", async () => {
		await renderGallery([
			makeApp("Agency", {
				isOwnApp: false,
				heroEyebrow: null,
				heroHeadline: null,
				productHeroImage: null,
				links: [],
			}),
			makeProjectGalleryItem({
				name: "Digest",
				slug: "digest",
				prominence: ProjectProminence.low,
				isOwnApp: true,
			}),
		])

		expect(
			within(sectionNamed("Featured projects")).getByRole("link", {
				name: "View Agency project",
			})
		).toHaveAttribute("href", "/projects/agency")
		expect(
			within(moreProjects()).getByRole("link", { name: "Digest", hidden: true })
		).toHaveAttribute("href", "/projects/digest")
	})

	it("gives the tiles and the cards no headings of their own, only screen-reader names, their titles a level below the page's", async () => {
		await renderGallery([
			makeApp("Reckon"),
			makeApp("Continuum"),
			makeCardProject("MyTherme"),
		])

		for (const name of ["Featured projects", "Selected projects"]) {
			expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument()
			expect(sectionNamed(name)).toBeInTheDocument()
		}
		expect(
			screen.getByRole("heading", { level: 2, name: /^Reckon/ })
		).toBeInTheDocument()
		expect(
			screen.getByRole("heading", { level: 2, name: "MyTherme" })
		).toBeInTheDocument()
	})

	it("leaves out a section with nothing in it", async () => {
		await renderGallery([makeApp("Reckon")])

		expect(
			screen.queryByRole("region", { name: "Selected projects" })
		).not.toBeInTheDocument()
		// The heading's name runs on into its button's "Show all N".
		expect(
			screen.queryByRole("heading", { level: 2, name: /^More projects/ })
		).not.toBeInTheDocument()
	})

	it("lists a prominence it doesn't know under More projects rather than dropping it", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
		await renderGallery([
			makeProjectGalleryItem({
				name: "Future",
				slug: "future",
				// A database ahead of the deploy: a level this build has no case for.
				prominence: "xHigh" as unknown as ProjectProminence,
			}),
		])

		expect(
			within(moreProjects()).getByRole("link", { name: "Future", hidden: true })
		).toBeInTheDocument()
		consoleError.mockRestore()
	})
})

// #endregion

// #region Tiles

describe("ProjectsPage — tiles", () => {
	it("pairs two tiles as halves, each with its eyebrow but not the product page's headline", async () => {
		await renderGallery([makeApp("Reckon"), makeApp("Continuum")])

		expect(
			screen.getByRole("heading", { level: 2, name: /^Reckon/ })
		).toHaveTextContent(/^Reckon: Reckon eyebrow$/)
		expect(screen.queryByText("Reckon headline")).not.toBeInTheDocument()
		expect(screen.queryByText("Continuum headline")).not.toBeInTheDocument()
		expect(screen.getByText("Reckon summary.")).toBeInTheDocument()
	})

	it("widens the first of three tiles, with the eyebrow and headline in it", async () => {
		await renderGallery([
			makeApp("Digest"),
			makeApp("Reckon"),
			makeApp("Continuum"),
		])

		const digest = articleTitled(/^Digest/)

		// One heading, joined for screen readers like the product page's h1.
		expect(within(digest).getByRole("heading", { level: 2 })).toHaveTextContent(
			"Digest: Digest eyebrow. Digest headline"
		)
		expect(digest.parentElement).toHaveClass("min-[900px]:col-span-2")
		expect(screen.queryByText("Reckon headline")).not.toBeInTheDocument()
	})

	it("gives a tile its store button and a link to the project named for screen readers", async () => {
		await renderGallery([makeApp("Reckon"), makeApp("Continuum")])

		const reckon = articleTitled(/^Reckon/)

		expect(
			within(reckon).getByRole("link", { name: "Download on the App Store" })
		).toHaveAttribute("href", appStoreLink("Reckon".length).url)
		expect(
			// The arrow is decoration, hidden from the link's name.
			within(reckon).getByRole("link", { name: "View Reckon project" })
		).toHaveAttribute("href", "/projects/reckon")
	})

	it("shows a tile without an eyebrow as its name alone", async () => {
		await renderGallery([
			makeApp("Reckon", { heroEyebrow: null }),
			makeApp("Continuum"),
		])

		expect(
			screen.getByRole("heading", { level: 2, name: /^Reckon/ })
		).toHaveTextContent(/^Reckon$/)
	})

	it("puts a wide tile's text beside its image, and lets it take the whole tile without one", async () => {
		await renderGallery([makeApp("Reckon")])
		const withImage = articleTitled(/^Reckon/)

		expect(withImage).toHaveClass(TEXT_BESIDE_IMAGE_COLUMNS_CLASS)
		expect(
			within(withImage).getByRole("img", { name: "Reckon screenshot" })
		).toBeInTheDocument()

		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			makeApp("Digest", { productHeroImage: null }),
		])
		render(await ProjectsPage())
		const withoutImage = articleTitled(/^Digest/)

		expect(withoutImage).not.toHaveClass(TEXT_BESIDE_IMAGE_COLUMNS_CLASS)
		expect(
			within(withoutImage).queryByRole("img", { name: "Digest screenshot" })
		).not.toBeInTheDocument()
	})

	it("pads a half tile's bottom only when there's no image to close it", async () => {
		await renderGallery([
			makeApp("Reckon"),
			makeApp("Continuum", { productHeroImage: null }),
		])

		expect(articleTitled(/^Reckon/)).not.toHaveClass("pb-9")
		expect(articleTitled(/^Continuum/)).toHaveClass("pb-9")
	})

	it("colours each tile with its palette in both themes, keyed by its slug", async () => {
		const { container } = await renderGallery([
			makeApp("Reckon", {
				accentColor: "#b5673f",
				palette: { light: theme, dark: darkTheme },
			}),
			makeApp("Continuum"),
		])

		const css = container.querySelector("style")?.textContent ?? ""

		expect(container.querySelector('[data-app-tile="reckon"]')).not.toBeNull()
		expect(css).toContain(
			`[data-app-tile="reckon"]{--project-accent:#b5673f;--product-band:${theme.band}`
		)
		expect(css).toContain(
			`.dark [data-app-tile="reckon"]{--product-band:${darkTheme.band}`
		)
		// No palette and no accent: nothing to write, the defaults apply.
		expect(css).not.toContain("continuum")
	})
})

// #endregion

// #region Cards

describe("ProjectsPage — cards", () => {
	it("shows the role and the platform, and links to the project", async () => {
		await renderGallery([
			makeCardProject("MyTherme", {
				slug: "mytherme",
				role: "Head of Digital",
				bucket: PlatformBucket.iOS,
				platformTags: [PlatformTag.iOS],
				summary: "A mobile app for thermal spas.",
			}),
		])

		const cards = sectionNamed("Selected projects")

		expect(within(cards).getByText("Head of Digital · iOS")).toBeInTheDocument()
		expect(
			within(cards).getByText("A mobile app for thermal spas.")
		).toBeInTheDocument()
		expect(
			within(cards).getByRole("link", { name: "View MyTherme project" })
		).toHaveAttribute("href", "/projects/mytherme")
	})

	it("shows the platform alone without a role", async () => {
		await renderGallery([
			makeCardProject("Site", {
				bucket: PlatformBucket.Web,
				platformTags: [PlatformTag.Frontend, PlatformTag.Backend],
			}),
		])

		expect(
			within(sectionNamed("Selected projects")).getByText("Fullstack")
		).toBeInTheDocument()
	})

	it("puts a card's text beside its image, and lets it take the whole card without one", async () => {
		await renderGallery([
			makeCardProject("MyTherme", { featuredImage: "/mytherme-card.png" }),
			makeCardProject("Site"),
		])

		expect(articleTitled("MyTherme")).toHaveClass(
			TEXT_BESIDE_IMAGE_COLUMNS_CLASS
		)
		expect(articleTitled("Site")).not.toHaveClass(
			TEXT_BESIDE_IMAGE_COLUMNS_CLASS
		)
		expect(
			within(articleTitled("Site")).queryByRole("img", {
				name: "Site screenshot",
			})
		).not.toBeInTheDocument()
	})
})

// #endregion

// #region More projects

describe("ProjectsPage — more projects", () => {
	function listedProject(
		name: string,
		bucket: PlatformBucket,
		overrides: Partial<ProjectGalleryItem> = {}
	) {
		return makeProjectGalleryItem({
			id: name.length * 100 + name.charCodeAt(0),
			name,
			slug: name.toLowerCase().replaceAll(" ", "-"),
			bucket,
			platformTags: [],
			...overrides,
		})
	}

	function moreButton(): HTMLElement {
		return screen.getByRole("button", { name: /^More projects/ })
	}

	function moreList(): HTMLElement {
		return document.getElementById(
			moreButton().getAttribute("aria-controls") ?? ""
		) as HTMLElement
	}

	async function toggleMore() {
		await user.click(moreButton())
	}

	it("starts closed, counting the projects in its button", async () => {
		await renderGallery([
			listedProject("Goalee", PlatformBucket.iOS),
			listedProject("DND Me", PlatformBucket.Mac),
		])

		// The heading is the button; the count beside it is for the eye only.
		expect(
			screen.getByRole("heading", { level: 2, name: /^More projects/ })
		).toContainElement(moreButton())
		expect(moreButton()).toHaveAccessibleName("More projects Show all 2")
		expect(moreButton()).toHaveAttribute("aria-expanded", "false")
		expect(moreList()).toHaveAttribute("inert")
	})

	it("opens the full list in place of the preview, and closes it again", async () => {
		await renderGallery([listedProject("Goalee", PlatformBucket.iOS)])

		// The preview's panel: the animated box around the padded one that holds
		// the preview row.
		const preview = document.querySelector(
			'#more-projects ul[aria-hidden="true"]'
		)?.parentElement?.parentElement as HTMLElement

		await toggleMore()
		expect(moreButton()).toHaveAttribute("aria-expanded", "true")
		expect(moreButton()).toHaveTextContent("Hide")
		expect(moreList()).not.toHaveAttribute("inert")
		expect(preview).toHaveAttribute("inert")

		await toggleMore()
		expect(moreButton()).toHaveAttribute("aria-expanded", "false")
		expect(moreList()).toHaveAttribute("inert")
		expect(preview).not.toHaveAttribute("inert")
	})

	it("groups the projects by platform, each under its own heading", async () => {
		await renderGallery([
			listedProject("Goalee", PlatformBucket.iOS),
			listedProject("DND Me", PlatformBucket.Mac),
			listedProject("team.cards", PlatformBucket.Web),
		])
		await toggleMore()

		const groupOf = (label: string) =>
			within(moreList())
				.getByRole("heading", { level: 3, name: label })
				.closest("div") as HTMLElement

		expect(
			within(groupOf("iOS")).getByRole("link", { name: "Goalee" })
		).toBeInTheDocument()
		expect(
			within(groupOf("Mac")).getByRole("link", { name: "DND Me" })
		).toBeInTheDocument()
		expect(within(groupOf("iOS")).queryByText("DND Me")).not.toBeInTheDocument()
	})

	it("tags a project only when the tag says more than its group's heading", async () => {
		await renderGallery([
			listedProject("Card Virtual", PlatformBucket.iOS, {
				platformTags: [PlatformTag.iOS, PlatformTag.Android],
			}),
			listedProject("Goalee", PlatformBucket.iOS, {
				platformTags: [PlatformTag.iOS],
			}),
		])
		await toggleMore()

		const cardVirtual = screen
			.getByRole("link", { name: "Card Virtual" })
			.closest("li") as HTMLElement
		const goalee = screen
			.getByRole("link", { name: "Goalee" })
			.closest("li") as HTMLElement

		expect(cardVirtual).toHaveTextContent("Multiplatform")
		// "iOS" under the iOS heading would say nothing new.
		expect(goalee).not.toHaveTextContent("iOS")
	})

	it("previews at most 10 icons, hidden from assistive tech and without links", async () => {
		await renderGallery(
			Array.from({ length: 12 }, (_, index) =>
				listedProject(`App ${index + 1}`, PlatformBucket.iOS, {
					id: index + 1,
				})
			)
		)

		const preview = document.querySelector(
			'#more-projects ul[aria-hidden="true"]'
		) as HTMLElement

		expect(preview.querySelectorAll("li")).toHaveLength(10)
		expect(preview.querySelector("a")).toBeNull()
		// The full list still links all 12.
		await toggleMore()
		expect(
			within(moreList()).getAllByRole("link", { name: /^App \d+$/ })
		).toHaveLength(12)
	})

	it("greys out a discontinued project's icon, not its name", async () => {
		await renderGallery([
			listedProject("Puppet Anthems", PlatformBucket.iOS, {
				isDiscontinued: true,
				icon: "/puppet.png",
			}),
		])
		await toggleMore()

		const link = screen.getByRole("link", { name: "Puppet Anthems" })

		expect(link.querySelector("img")).toHaveClass("grayscale")
		expect(within(link).getByText("Puppet Anthems")).not.toHaveClass(
			"grayscale"
		)
	})
})

// #endregion
