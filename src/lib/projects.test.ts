import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import {
	getAllProjects,
	getAllProjectsForGallery,
	getProjectBySlug,
	listProjectsForAdmin,
} from "@/lib/projects"
import { makeProjectListItem } from "@/test/fixtures"

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("react", async (importOriginal) => {
	const { reactCachePassthroughFactory } =
		await import("@/test/mocks/nextCache")

	return reactCachePassthroughFactory(importOriginal)
})

vi.mock("@/lib/db", () => ({
	prisma: {
		project: {
			findMany: vi.fn(),
			findUnique: vi.fn(),
		},
	},
}))

beforeEach(() => {
	vi.resetAllMocks()
})

// #region getAllProjects

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

// #endregion

// #region getAllProjectsForGallery

describe("getAllProjectsForGallery", () => {
	it("orders discontinued projects last when sortDiscontinued is true (default)", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		await getAllProjectsForGallery()

		expect(prisma.project.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				orderBy: [
					{ isDiscontinued: "asc" },
					{ sortOrder: "asc" },
					{ name: "asc" },
				],
			})
		)
	})

	it("skips the discontinued-last ordering when sortDiscontinued is false", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		await getAllProjectsForGallery({ sortDiscontinued: false })

		expect(prisma.project.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
			})
		)
	})
})

// #endregion

// #region listProjectsForAdmin

describe("listProjectsForAdmin", () => {
	it("falls back to the full admin gallery when the query is empty", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		await listProjectsForAdmin({ query: "" })

		// Empty query → getAllProjectsForGallery({ sortDiscontinued: false }),
		// i.e. no `where` filter and the unsorted-by-discontinued ordering.
		expect(prisma.project.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
			})
		)

		const args = vi.mocked(prisma.project.findMany).mock.calls[0][0]
		expect(args?.where).toBeUndefined()
	})

	it("falls back to the full gallery when the query is whitespace-only", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		await listProjectsForAdmin({ query: "   " })

		const args = vi.mocked(prisma.project.findMany).mock.calls[0][0]
		expect(args?.where).toBeUndefined()
	})

	it("filters by case-insensitive name contains when the query is non-empty", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		await listProjectsForAdmin({ query: "Alph" })

		expect(prisma.project.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { name: { contains: "Alph", mode: "insensitive" } },
				take: 100,
			})
		)
	})

	it("trims surrounding whitespace before searching", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		await listProjectsForAdmin({ query: "  Beta  " })

		expect(prisma.project.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { name: { contains: "Beta", mode: "insensitive" } },
			})
		)
	})
})

// #endregion

// #region getProjectBySlug

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

// #endregion
