import { revalidateTag } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/db"
import {
	getAllProjects,
	getAllProjectsForGallery,
	getProjectBySlug,
	listProjectsForAdmin,
	loadProject,
	loadProjectForAdmin,
	revalidateProject,
	toLinkCreate,
	toProjectFormInitialData,
	toSectionCreate,
	type AdminProjectDetail,
} from "@/lib/db/projects"
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

vi.mock("@/lib/db/db", () => ({
	prisma: {
		project: {
			findMany: vi.fn(),
			findUnique: vi.fn(),
			count: vi.fn(),
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
		const result = await listProjectsForAdmin({ query: "", page: 1 })

		// Empty query → getAllProjectsForGallery({ sortDiscontinued: false }),
		// i.e. no `where` filter and the unsorted-by-discontinued ordering.
		expect(prisma.project.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
			})
		)

		const args = vi.mocked(prisma.project.findMany).mock.calls[0][0]
		expect(args?.where).toBeUndefined()
		// Non-search returns everything with no pagination metadata to render.
		expect(result.totalPages).toBe(1)
	})

	it("falls back to the full gallery when the query is whitespace-only", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		await listProjectsForAdmin({ query: "   ", page: 1 })

		const args = vi.mocked(prisma.project.findMany).mock.calls[0][0]
		expect(args?.where).toBeUndefined()
	})

	it("filters by case-insensitive name contains when the query is non-empty", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		vi.mocked(prisma.project.count).mockResolvedValue(0)
		await listProjectsForAdmin({ query: "Alph", page: 1 })

		expect(prisma.project.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { name: { contains: "Alph", mode: "insensitive" } },
				skip: 0,
				take: 10,
			})
		)
	})

	it("trims surrounding whitespace before searching", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		vi.mocked(prisma.project.count).mockResolvedValue(0)
		await listProjectsForAdmin({ query: "  Beta  ", page: 1 })

		expect(prisma.project.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { name: { contains: "Beta", mode: "insensitive" } },
			})
		)
	})

	it("applies page-based skip when searching page 2+", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		vi.mocked(prisma.project.count).mockResolvedValue(0)
		await listProjectsForAdmin({ query: "Alph", page: 3 })

		expect(prisma.project.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ skip: 20, take: 10 })
		)
	})

	it("reports totalPages from the filtered count when searching", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		vi.mocked(prisma.project.count).mockResolvedValue(25)
		const result = await listProjectsForAdmin({ query: "Alph", page: 1 })

		// 25 matches / 10 per page = 3 pages
		expect(result.totalPages).toBe(3)
		expect(result.totalCount).toBe(25)
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

// #region loadProject / loadProjectForAdmin

describe("loadProject", () => {
	it("delegates to getProjectBySlug", async () => {
		const project = {
			...makeProjectListItem(),
			summary: "s",
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
		vi.mocked(prisma.project.findUnique).mockResolvedValue(
			project as Awaited<ReturnType<typeof prisma.project.findUnique>>
		)

		const result = await loadProject("my-app")
		expect(result).toEqual(project)
	})
})

describe("loadProjectForAdmin", () => {
	it("queries by numeric id with the full projectInclude expansion", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(null)
		await loadProjectForAdmin(42)

		const call = vi.mocked(prisma.project.findUnique).mock.calls[0][0] as {
			where: { id: number }
			include: Record<string, unknown>
		}
		expect(call.where).toEqual({ id: 42 })
		// `projectInclude` must expand sections (with images) and links; a
		// silent narrowing of `include` would starve the admin form of data.
		expect(call.include).toHaveProperty("sections")
		expect(call.include).toHaveProperty("links")
	})

	it("returns null when no matching project exists", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(null)
		expect(await loadProjectForAdmin(999)).toBeNull()
	})
})

// #endregion

// #region toSectionCreate

describe("toSectionCreate", () => {
	it("returns undefined when sections is undefined (Prisma-skip)", () => {
		// Prisma treats `undefined` as "do not touch the column", so returning
		// undefined rather than an empty `create` array keeps update semantics
		// correct: an unchanged-sections payload doesn't wipe existing rows.
		expect(toSectionCreate(undefined)).toBeUndefined()
	})

	it("maps each section to a create clause with defaults applied", () => {
		const result = toSectionCreate([
			{ title: "T", description: "D" },
			{
				title: "T2",
				description: "D2",
				sortOrder: 5,
				images: [
					{ url: "https://example.com/a.png" },
					{
						url: "https://example.com/b.png",
						caption: "cap",
						sortOrder: 2,
					},
				],
			},
		])

		expect(result).toEqual({
			create: [
				{
					title: "T",
					description: "D",
					sortOrder: 0,
					images: undefined,
				},
				{
					title: "T2",
					description: "D2",
					sortOrder: 5,
					images: {
						create: [
							{ url: "https://example.com/a.png", caption: null, sortOrder: 0 },
							{
								url: "https://example.com/b.png",
								caption: "cap",
								sortOrder: 2,
							},
						],
					},
				},
			],
		})
	})
})

// #endregion

// #region toLinkCreate

describe("toLinkCreate", () => {
	it("returns undefined when links is undefined", () => {
		expect(toLinkCreate(undefined)).toBeUndefined()
	})

	it("defaults sortOrder to 0 when not provided", () => {
		const result = toLinkCreate([
			{ label: "App Store", url: "https://apps.apple.com/x" },
		])
		expect(result?.create[0].sortOrder).toBe(0)
	})

	it("preserves an explicit sortOrder", () => {
		const result = toLinkCreate([
			{ label: "GitHub", url: "https://github.com/x", sortOrder: 2 },
		])
		expect(result?.create[0].sortOrder).toBe(2)
	})
})

// #endregion

// #region toProjectFormInitialData

describe("toProjectFormInitialData", () => {
	function makeAdminDetail(): AdminProjectDetail {
		return {
			id: 1,
			name: "My App",
			slug: "my-app",
			summary: "s",
			platform: "iOS",
			role: null,
			accentColor: null,
			icon: null,
			heroImage: null,
			isFeatured: false,
			isDiscontinued: false,
			date: null,
			sortOrder: 0,
			createdAt: new Date(),
			updatedAt: new Date(),
			sections: [
				{
					id: 10,
					projectId: 1,
					title: "Section",
					description: "Desc",
					sortOrder: 0,
					images: [
						{
							id: 100,
							sectionId: 10,
							url: "https://example.com/a.png",
							caption: null,
							sortOrder: 0,
						},
						{
							id: 101,
							sectionId: 10,
							url: "https://example.com/b.png",
							caption: "hi",
							sortOrder: 1,
						},
					],
				},
			],
			links: [
				{
					id: 200,
					projectId: 1,
					label: "Web",
					url: "https://example.com",
					sortOrder: 0,
				},
			],
		} as unknown as AdminProjectDetail
	}

	it("coerces null image captions to empty strings (form contract)", () => {
		// ProjectForm's caption field is a plain string — rendering `null` as a
		// controlled input value would throw a React warning and break editing.
		const data = toProjectFormInitialData(makeAdminDetail())
		expect(data.sections[0].images[0].caption).toBe("")
	})

	it("leaves non-null image captions untouched", () => {
		const data = toProjectFormInitialData(makeAdminDetail())
		expect(data.sections[0].images[1].caption).toBe("hi")
	})

	it("preserves top-level project fields untouched", () => {
		const detail = makeAdminDetail()
		const data = toProjectFormInitialData(detail)

		expect(data.id).toBe(detail.id)
		expect(data.name).toBe(detail.name)
		expect(data.slug).toBe(detail.slug)
		expect(data.links).toEqual(detail.links)
	})
})

// #endregion

// #region revalidateProject

describe("revalidateProject", () => {
	it("invalidates both the global projects tag and the per-slug tag", () => {
		revalidateProject("my-app")
		expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith("projects", "max")
		expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(
			"project-my-app",
			"max"
		)
	})
})

// #endregion
