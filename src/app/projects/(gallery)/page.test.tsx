import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { getProjectsGalleryCached } from "@/lib/db/projects"
import { makeProjectGalleryItem } from "@/test/fixtures"
import ProjectsPage, { metadata } from "./page"

/**
 * The `(gallery)` route group's move (see `loadingBoundaries.test.ts`) was
 * covered only by filesystem assertions — nothing rendered this page or
 * checked its metadata, so a broken move would surface only at build time.
 */

vi.mock("@/lib/db/projects", () => ({
	getProjectsGalleryCached: vi.fn(),
}))

beforeEach(() => {
	vi.resetAllMocks()
})

describe("ProjectsPage — metadata", () => {
	it("titles the page Projects", () => {
		expect(metadata.title).toBe("Projects")
	})

	it("identifies the page at /projects", () => {
		// `buildPageMetadata` only sets `alternates.canonical` when a caller
		// passes `canonicalPath` separately from `path` — this page doesn't, so
		// `path` surfaces via `openGraph.url` instead (same shape the blog list
		// pages assert on for the same reason).
		expect(metadata.openGraph?.url).toBe("/projects")
	})
})

describe("ProjectsPage — rendering", () => {
	it("renders with no projects", async () => {
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([])

		await expect(ProjectsPage()).resolves.toBeTruthy()
	})

	it("renders a featured project under the Featured heading", async () => {
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			makeProjectGalleryItem({
				name: "Reckon",
				slug: "reckon",
				isFeatured: true,
			}),
		])

		const { getByText } = render(await ProjectsPage())

		expect(getByText("Featured")).toBeTruthy()
		expect(getByText("Reckon")).toBeTruthy()
	})

	it("does not render the Featured heading when nothing is featured", async () => {
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			makeProjectGalleryItem({ name: "Reckon", isFeatured: false }),
		])

		const { queryByText } = render(await ProjectsPage())

		expect(queryByText("Featured")).toBeNull()
	})

	it("groups non-featured projects by platform bucket", async () => {
		// Asserted through the DOM structure, not by checking both names
		// rendered: two projects in two buckets render the same two names
		// whether they're grouped, in one flat list, or grouped wrongly. The
		// heading-to-section relationship is the actual behaviour, so the test
		// walks from each bucket's `<h2>` to its own `<section>` and checks what
		// sits under it.
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			makeProjectGalleryItem({
				name: "Reckon",
				slug: "reckon",
				bucket: PlatformBucket.iOS,
				platformTags: [PlatformTag.iOS],
				isFeatured: false,
			}),
			makeProjectGalleryItem({
				name: "Continuum",
				slug: "continuum",
				bucket: PlatformBucket.iOS,
				platformTags: [PlatformTag.iOS],
				isFeatured: false,
			}),
			makeProjectGalleryItem({
				name: "roland.leth.ro",
				slug: "roland-leth-ro",
				bucket: PlatformBucket.Web,
				platformTags: [PlatformTag.Frontend],
				isFeatured: false,
			}),
		])

		const { getByText } = render(await ProjectsPage())

		const iosSection = getByText("iOS").closest("section")
		const webSection = getByText("Web").closest("section")

		expect(iosSection).not.toBeNull()
		expect(webSection).not.toBeNull()
		expect(iosSection).not.toBe(webSection)

		// Both iOS projects under the iOS heading, and neither under Web —
		// the second half is what fails if grouping collapses to one list.
		expect(iosSection?.textContent).toContain("Reckon")
		expect(iosSection?.textContent).toContain("Continuum")
		expect(iosSection?.textContent).not.toContain("roland.leth.ro")

		expect(webSection?.textContent).toContain("roland.leth.ro")
		expect(webSection?.textContent).not.toContain("Reckon")
	})

	it("renders one section per bucket, not one per project", async () => {
		// The other way grouping can break: a `map` over projects instead of
		// over groups still puts each project under a correct-looking heading,
		// and every assertion above would hold.
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			makeProjectGalleryItem({
				name: "Reckon",
				slug: "reckon",
				bucket: PlatformBucket.iOS,
				isFeatured: false,
			}),
			makeProjectGalleryItem({
				name: "Continuum",
				slug: "continuum",
				bucket: PlatformBucket.iOS,
				isFeatured: false,
			}),
		])

		const { container, getAllByText } = render(await ProjectsPage())

		expect(container.querySelectorAll("section")).toHaveLength(1)
		expect(getAllByText("iOS")).toHaveLength(1)
	})
})
