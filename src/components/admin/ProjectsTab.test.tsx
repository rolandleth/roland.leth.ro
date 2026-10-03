import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	PlatformBucket,
	PlatformTag,
	ProjectProminence,
} from "@/generated/prisma/enums"
import { listProjectsForAdmin } from "@/lib/db/projects"
import { makeProjectGalleryItem } from "@/test/fixtures"
import ProjectsTab from "./ProjectsTab"
import type { ProjectGalleryItem } from "@/lib/db/projects"

vi.mock("@/lib/db/projects", () => ({
	listProjectsForAdmin: vi.fn(),
}))

// The inline controls call `useRouter`, which would crash this render; they're
// exercised by their own suites, so this one stays on the grouping.
vi.mock("@/components/admin/ProjectAdminControls", () => ({
	default: () => null,
}))

beforeEach(() => {
	vi.resetAllMocks()
})

async function renderTab(
	projects: ProjectGalleryItem[],
	{ query = "" }: { query?: string } = {}
) {
	vi.mocked(listProjectsForAdmin).mockResolvedValue({
		projects,
		totalCount: projects.length,
		totalPages: 1,
	})

	return render(await ProjectsTab({ query, page: 1 }))
}

function project(
	id: number,
	name: string,
	overrides: Partial<ProjectGalleryItem> = {}
): ProjectGalleryItem {
	return makeProjectGalleryItem({
		id,
		name,
		slug: name.toLowerCase(),
		...overrides,
	})
}

/** The group under the `h3` with this label. */
function group(label: string): HTMLElement {
	return screen
		.getByRole("heading", { level: 3, name: label })
		.closest("div") as HTMLElement
}

// #region Grouped view

describe("ProjectsTab — grouped view", () => {
	it("groups high and medium by level, in that order, and low by platform", async () => {
		await renderTab([
			project(1, "Goalee", { prominence: ProjectProminence.low }),
			project(2, "MyTherme", { prominence: ProjectProminence.medium }),
			project(3, "Reckon", { prominence: ProjectProminence.high }),
		])

		// The large cards' names are `h3`s too, so the order is read off the
		// groups' positions rather than the list of headings.
		const [high, medium, ios] = ["High", "Medium", "iOS"].map(group)
		expect(high.compareDocumentPosition(medium)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING
		)
		expect(medium.compareDocumentPosition(ios)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING
		)
		expect(within(group("High")).getByText("Reckon")).toBeInTheDocument()
		expect(within(group("Medium")).getByText("MyTherme")).toBeInTheDocument()
		expect(within(group("iOS")).getByText("Goalee")).toBeInTheDocument()
	})

	it("links each card to its editor", async () => {
		await renderTab([
			project(3, "Reckon", { prominence: ProjectProminence.high }),
		])

		expect(
			within(group("High")).getByRole("link", { name: /Reckon/ })
		).toHaveAttribute("href", "/admin/projects/3/edit")
	})

	// The gallery lists a discontinued project under More projects whatever its
	// level; here the level is what's being edited, so it stays put.
	it("keeps a discontinued project in its level's group", async () => {
		await renderTab([
			project(3, "Reckon", {
				prominence: ProjectProminence.high,
				isDiscontinued: true,
			}),
		])

		expect(within(group("High")).getByText("Reckon")).toBeInTheDocument()
	})

	it("leaves out a level with nothing in it", async () => {
		await renderTab([
			project(1, "Goalee", { prominence: ProjectProminence.low }),
		])

		expect(
			screen.queryByRole("heading", { level: 3, name: "High" })
		).not.toBeInTheDocument()
		expect(
			screen.queryByRole("heading", { level: 3, name: "Medium" })
		).not.toBeInTheDocument()
	})

	it("lists a level it doesn't know under its platform rather than dropping it", async () => {
		await renderTab([
			project(1, "Future", {
				// A database ahead of the deploy.
				prominence: "xHigh" as unknown as ProjectProminence,
				bucket: PlatformBucket.Mac,
				platformTags: [PlatformTag.macOS],
			}),
		])

		expect(within(group("Mac")).getByText("Future")).toBeInTheDocument()
	})

	it("says so when there are no projects", async () => {
		await renderTab([])

		expect(screen.getByText("No projects yet.")).toBeInTheDocument()
	})
})

// #endregion

// #region Search results

describe("ProjectsTab — search results", () => {
	it("names each result's prominence beside its platform", async () => {
		await renderTab(
			[
				project(3, "Reckon", { prominence: ProjectProminence.high }),
				project(1, "Recall", { prominence: ProjectProminence.low }),
			],
			{ query: "rec" }
		)

		expect(screen.getByText("iOS · High prominence")).toBeInTheDocument()
		expect(screen.getByText("iOS · Low prominence")).toBeInTheDocument()
	})
})

// #endregion
