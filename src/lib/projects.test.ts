import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { getAllProjects, getProjectBySlug } from "@/lib/projects"

vi.mock("@/lib/db", () => ({
	prisma: {
		project: {
			findMany: vi.fn(),
			findUnique: vi.fn(),
		},
	},
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProjectListItem(
	overrides: Partial<{ id: number; name: string; slug: string }> = {}
) {
	return {
		id: 1,
		name: "My App",
		slug: "my-app",
		platform: "iOS",
		isFeatured: false,
		isDiscontinued: false,
		sortOrder: 0,
		icon: null,
		...overrides,
	}
}

beforeEach(() => {
	vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// getAllProjects
// ---------------------------------------------------------------------------

describe("getAllProjects", () => {
	it("returns the list of projects from prisma", async () => {
		const projects = [
			makeProjectListItem({ id: 1, name: "Alpha" }),
			makeProjectListItem({ id: 2, name: "Beta" }),
		]
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			projects as Awaited<ReturnType<typeof prisma.project.findMany>>
		)

		const result = await getAllProjects()
		expect(result).toEqual(projects)
	})

	it("returns an empty array when there are no projects", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue([])

		const result = await getAllProjects()
		expect(result).toEqual([])
	})
})

// ---------------------------------------------------------------------------
// getProjectBySlug
// ---------------------------------------------------------------------------

describe("getProjectBySlug", () => {
	const fullProject = {
		...makeProjectListItem(),
		summary: "An iOS app.",
		heroImage: null,
		role: null,
		accentColor: null,
		isFeatured: false,
		isDiscontinued: false,
		date: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		sections: [],
		links: [],
	}

	it("returns the project when found", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(
			fullProject as Awaited<ReturnType<typeof prisma.project.findUnique>>
		)

		const result = await getProjectBySlug("my-app")
		expect(result).toEqual(fullProject)
	})

	it("returns null when the project is not found", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

		const result = await getProjectBySlug("nonexistent")
		expect(result).toBeNull()
	})
})
