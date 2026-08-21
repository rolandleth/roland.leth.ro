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
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			makeProjectGalleryItem({
				name: "Reckon",
				slug: "reckon",
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

		expect(getByText("Reckon")).toBeTruthy()
		expect(getByText("roland.leth.ro")).toBeTruthy()
	})
})
