import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
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

const appStoreLink = (id: number) => ({
	id,
	label: "App Store",
	url: `https://apps.apple.com/app/id${id}`,
})

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
		isFeatured: true,
		isOwnApp: true,
		summary: `${name} summary.`,
		heroEyebrow: `${name} eyebrow`,
		heroHeadline: `${name} headline`,
		links: [appStoreLink(name.length)],
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

	it("puts featured own apps under My apps, other featured projects under Work, and the rest under Earlier projects", async () => {
		await renderGallery([
			makeApp("Reckon"),
			makeProjectGalleryItem({
				name: "MyTherme",
				slug: "mytherme",
				isFeatured: true,
			}),
			makeProjectGalleryItem({
				name: "Body Tracking",
				slug: "body-tracking",
				isOwnApp: true,
			}),
		])

		// A lone app's tile is wide: its heading carries the eyebrow and headline.
		expect(
			within(screen.getByRole("region", { name: "My apps" })).getByRole(
				"heading",
				{ name: /^Reckon/ }
			)
		).toBeInTheDocument()
		expect(
			within(sectionNamed("Work")).getByRole("heading", {
				level: 2,
				name: "MyTherme",
			})
		).toBeInTheDocument()

		const earlier = document.getElementById("earlier-projects") as HTMLElement
		// Closed, the list is inert and hidden from the accessibility tree; its
		// links are in the HTML all the same.
		expect(
			within(earlier).getByRole("link", { name: "Body Tracking", hidden: true })
		).toHaveAttribute("href", "/projects/body-tracking")
		// Each project in one place only: the featured ones aren't listed again.
		expect(within(earlier).queryByText("MyTherme")).toBeNull()
		expect(within(earlier).queryByText("Reckon")).toBeNull()
	})

	it("gives the apps and the work no headings of their own, only screen-reader names, their titles a level below the page's", async () => {
		await renderGallery([
			makeApp("Reckon"),
			makeApp("Continuum"),
			makeProjectGalleryItem({ name: "MyTherme", isFeatured: true }),
		])

		for (const name of ["My apps", "Work"]) {
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
			screen.queryByRole("region", { name: "Work" })
		).not.toBeInTheDocument()
		// The heading's name runs on into its button's "Show all N".
		expect(
			screen.queryByRole("heading", { level: 2, name: /^Earlier projects/ })
		).not.toBeInTheDocument()
	})
})

// #endregion

// #region App tiles

describe("ProjectsPage — app tiles", () => {
	it("pairs two apps as half tiles, each with its eyebrow but not the product page's headline", async () => {
		await renderGallery([makeApp("Reckon"), makeApp("Continuum")])

		expect(
			screen.getByRole("heading", { level: 2, name: /^Reckon/ })
		).toHaveTextContent(/^Reckon: Reckon eyebrow$/)
		expect(screen.queryByText("Reckon headline")).not.toBeInTheDocument()
		expect(screen.queryByText("Continuum headline")).not.toBeInTheDocument()
		expect(screen.getByText("Reckon summary.")).toBeInTheDocument()
	})

	it("widens the first of three apps, with the eyebrow and headline in its tile", async () => {
		await renderGallery([
			makeApp("Digest"),
			makeApp("Reckon"),
			makeApp("Continuum"),
		])

		const digest = screen
			.getByRole("heading", { level: 2, name: /^Digest/ })
			.closest("article") as HTMLElement

		// One heading, joined for screen readers like the product page's h1.
		expect(within(digest).getByRole("heading", { level: 2 })).toHaveTextContent(
			"Digest: Digest eyebrow. Digest headline"
		)
		expect(digest.parentElement).toHaveClass("min-[900px]:col-span-2")
		expect(screen.queryByText("Reckon headline")).not.toBeInTheDocument()
	})

	it("gives a tile its store button and a link to the project named for screen readers", async () => {
		await renderGallery([makeApp("Reckon"), makeApp("Continuum")])

		const reckon = screen
			.getByRole("heading", { level: 2, name: /^Reckon/ })
			.closest("article") as HTMLElement

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

// #region Work

describe("ProjectsPage — work", () => {
	it("shows the role and the platform, and links to the project", async () => {
		await renderGallery([
			makeProjectGalleryItem({
				name: "MyTherme",
				slug: "mytherme",
				isFeatured: true,
				role: "Head of Digital",
				bucket: PlatformBucket.iOS,
				platformTags: [PlatformTag.iOS],
				summary: "A mobile app for thermal spas.",
			}),
		])

		const work = sectionNamed("Work")

		expect(within(work).getByText("Head of Digital · iOS")).toBeInTheDocument()
		expect(
			within(work).getByText("A mobile app for thermal spas.")
		).toBeInTheDocument()
		expect(
			within(work).getByRole("link", { name: "View MyTherme project" })
		).toHaveAttribute("href", "/projects/mytherme")
	})

	it("shows the platform alone without a role", async () => {
		await renderGallery([
			makeProjectGalleryItem({
				name: "Site",
				isFeatured: true,
				bucket: PlatformBucket.Web,
				platformTags: [PlatformTag.Frontend, PlatformTag.Backend],
			}),
		])

		expect(
			within(sectionNamed("Work")).getByText("Fullstack")
		).toBeInTheDocument()
	})
})

// #endregion

// #region Earlier projects

describe("ProjectsPage — earlier projects", () => {
	function earlierProject(
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

	function earlierButton(): HTMLElement {
		return screen.getByRole("button", { name: /^Earlier projects/ })
	}

	function earlierList(): HTMLElement {
		return document.getElementById(
			earlierButton().getAttribute("aria-controls") ?? ""
		) as HTMLElement
	}

	async function openEarlier() {
		await user.click(earlierButton())
	}

	it("starts closed, counting the projects in its button", async () => {
		await renderGallery([
			earlierProject("Goalee", PlatformBucket.iOS),
			earlierProject("DND Me", PlatformBucket.Mac),
		])

		// The heading is the button; the count beside it is for the eye only.
		expect(
			screen.getByRole("heading", { level: 2, name: /^Earlier projects/ })
		).toContainElement(earlierButton())
		expect(earlierButton()).toHaveAccessibleName("Earlier projects Show all 2")
		expect(earlierButton()).toHaveAttribute("aria-expanded", "false")
		expect(earlierList()).toHaveAttribute("inert")
	})

	it("opens the full list in place of the preview, and closes it again", async () => {
		await renderGallery([earlierProject("Goalee", PlatformBucket.iOS)])

		// The preview's panel: the animated box around the padded one that holds
		// the preview row.
		const preview = document.querySelector(
			'#earlier-projects ul[aria-hidden="true"]'
		)?.parentElement?.parentElement as HTMLElement

		await openEarlier()
		expect(earlierButton()).toHaveAttribute("aria-expanded", "true")
		expect(earlierButton()).toHaveTextContent("Hide")
		expect(earlierList()).not.toHaveAttribute("inert")
		expect(preview).toHaveAttribute("inert")

		await openEarlier()
		expect(earlierButton()).toHaveAttribute("aria-expanded", "false")
		expect(earlierList()).toHaveAttribute("inert")
		expect(preview).not.toHaveAttribute("inert")
	})

	it("groups the projects by platform, each under its own heading", async () => {
		await renderGallery([
			earlierProject("Goalee", PlatformBucket.iOS),
			earlierProject("DND Me", PlatformBucket.Mac),
			earlierProject("team.cards", PlatformBucket.Web),
		])
		await openEarlier()

		const groupOf = (label: string) =>
			within(earlierList())
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
			earlierProject("Card Virtual", PlatformBucket.iOS, {
				platformTags: [PlatformTag.iOS, PlatformTag.Android],
			}),
			earlierProject("Goalee", PlatformBucket.iOS, {
				platformTags: [PlatformTag.iOS],
			}),
		])
		await openEarlier()

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
				earlierProject(`App ${index + 1}`, PlatformBucket.iOS, {
					id: index + 1,
				})
			)
		)

		const preview = document.querySelector(
			'#earlier-projects ul[aria-hidden="true"]'
		) as HTMLElement

		expect(preview.querySelectorAll("li")).toHaveLength(10)
		expect(preview.querySelector("a")).toBeNull()
		// The full list still links all 12.
		await openEarlier()
		expect(
			within(earlierList()).getAllByRole("link", { name: /^App \d+$/ })
		).toHaveLength(12)
	})

	it("greys out a discontinued project's icon, not its name", async () => {
		await renderGallery([
			earlierProject("Puppet Anthems", PlatformBucket.iOS, {
				isDiscontinued: true,
				icon: "/puppet.png",
			}),
		])
		await openEarlier()

		const link = screen.getByRole("link", { name: "Puppet Anthems" })

		expect(link.querySelector("img")).toHaveClass("grayscale")
		expect(within(link).getByText("Puppet Anthems")).not.toHaveClass(
			"grayscale"
		)
	})
})

// #endregion
