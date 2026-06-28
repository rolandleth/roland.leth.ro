import { revalidateTag, unstable_cache } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { prisma } from "@/lib/db/db"
import {
	getAllProjects,
	getProjectBySlug,
	getProjectsForAdmin,
	getProjectsGalleryCached,
	listProjectsForAdmin,
	loadProject,
	loadProjectForAdmin,
	revalidateProject,
	toProjectFormInitialData,
	type AdminProjectDetail,
} from "@/lib/db/projects"
import { makeProjectListItem } from "@/test/fixtures"

vi.mock("next/cache", async () => {
	const { nextCacheSpyFactory } = await import("@/test/mocks/nextCache")

	return nextCacheSpyFactory()
})

// Snapshot every `unstable_cache(...)` registration from projects.ts at
// module-load time, before `beforeEach`'s `vi.resetAllMocks()` wipes the
// spy's call history. The admin-bypass test reads from this snapshot to pin
// the set of cached entries — anything new (or a regression that wraps
// `getProjectsForAdmin`) drifts the snapshot and fails the test.
const cacheWrapsAtLoad = vi.mocked(unstable_cache).mock.calls.map((call) => ({
	keys: call[1],
	tags: (call[2] as { tags?: string[] } | undefined)?.tags,
}))

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

/**
 * Builds a row in the `gallerySelect` shape (project scalars plus the trimmed
 * `sections[].images[]` the first-image fallback reads). Only the image-related
 * fields vary per test; the rest come from `makeProjectListItem`.
 */
function makeGalleryRow(overrides: {
	id?: number
	cardImage: string | null
	ogImage: string | null
	heroImage: string | null
	sections: { images: { url: string }[] }[]
}) {
	const { id, cardImage, ogImage, heroImage, sections } = overrides

	return {
		...makeProjectListItem({ id }),
		summary: "s",
		role: null,
		accentColor: null,
		cardImage,
		ogImage,
		heroImage,
		sections,
	}
}

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

// #region getProjectsGalleryCached / getProjectsForAdmin

describe("getProjectsGalleryCached", () => {
	it("orders discontinued projects last", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		await getProjectsGalleryCached()

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

	it("selects bucket and platformTags (catch silent drops from gallerySelect)", async () => {
		// A typo dropping `bucket` or `platformTags` from the internal
		// `gallerySelect` would still pass mock-based tests that only check
		// the returned shape — assert directly against the `select` argument
		// so the contract with consumers (CompactProjectCard, groupByBucket,
		// isCompactLabelRedundant) can't silently degrade.
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		await getProjectsGalleryCached()

		expect(prisma.project.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				select: expect.objectContaining({ bucket: true, platformTags: true }),
			})
		)
	})

	it("selects the image fields the featuredImage fallback depends on", async () => {
		// `toGalleryItem` resolves `cardImage ?? heroImage ?? first section image`.
		// Dropping any of these from `gallerySelect` would silently strand the
		// fallback (mock tests can't catch it since the mock ignores `select`).
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		await getProjectsGalleryCached()

		const args = vi.mocked(prisma.project.findMany).mock.calls[0][0]
		expect(args?.select).toMatchObject({
			cardImage: true,
			ogImage: true,
			heroImage: true,
			sections: { select: { images: expect.objectContaining({ take: 1 }) } },
		})
	})
})

describe("getProjectsForAdmin", () => {
	it("skips the discontinued-last ordering so admin edits stay in their slot", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			[] as Awaited<ReturnType<typeof prisma.project.findMany>>
		)
		await getProjectsForAdmin()

		expect(prisma.project.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
			})
		)
	})

	it("resolves featuredImage as cardImage → ogImage → hero → first section image", async () => {
		// One row per precedence rung plus the empty-leading-section case, so the
		// `cardImage ?? ogImage ?? heroImage ?? firstImage` collapse in
		// `resolveCardImage` is pinned against silent reordering or a dropped rung.
		const rows = [
			makeGalleryRow({
				id: 1,
				cardImage: "/card.png",
				ogImage: "/og.png",
				heroImage: "/hero.png",
				sections: [{ images: [{ url: "/first.png" }] }],
			}),
			makeGalleryRow({
				id: 2,
				cardImage: null,
				ogImage: "/og.png",
				heroImage: "/hero.png",
				sections: [{ images: [{ url: "/first.png" }] }],
			}),
			makeGalleryRow({
				id: 3,
				cardImage: null,
				ogImage: null,
				heroImage: "/hero.png",
				sections: [{ images: [{ url: "/first.png" }] }],
			}),
			makeGalleryRow({
				id: 4,
				cardImage: null,
				ogImage: null,
				heroImage: null,
				// First section has no images: the fallback skips it and lands on
				// the next section's first image.
				sections: [{ images: [] }, { images: [{ url: "/second.png" }] }],
			}),
			makeGalleryRow({
				id: 5,
				cardImage: null,
				ogImage: null,
				heroImage: null,
				sections: [],
			}),
		]
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			rows as unknown as Awaited<ReturnType<typeof prisma.project.findMany>>
		)

		const result = await getProjectsForAdmin()
		expect(result.map((p) => p.featuredImage)).toEqual([
			"/card.png",
			"/og.png",
			"/hero.png",
			"/second.png",
			null,
		])
	})

	it("is not wrapped in unstable_cache (admin reads must bypass the cache)", () => {
		// Pin the set of `unstable_cache(...)` wraps registered at module load
		// in projects.ts. The `getProjectBySlug` wrappers are created lazily
		// per-slug at call time, so they don't show up here. If a regression
		// accidentally wraps the admin reader — silently caching admin reads
		// and hiding fresh edits from the admin UI — this set grows.
		expect(cacheWrapsAtLoad).toEqual([
			{ keys: ["projects-gallery"], tags: ["projects"] },
			{ keys: ["all-project-slugs"], tags: ["projects"] },
		])
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

		// Empty query → getProjectsForAdmin(), i.e. no `where` filter and the
		// unsorted-by-discontinued ordering (admin edits stay in their slot).
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
		metaTitle: null,
		keywords: [],
		offers: null,
		cardImage: null,
		ogImage: null,
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
		faqs: [],
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
			metaTitle: null,
			keywords: [],
			offers: null,
			cardImage: null,
			ogImage: null,
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
			faqs: [],
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

// #region toProjectFormInitialData

describe("toProjectFormInitialData", () => {
	function makeAdminDetail(): AdminProjectDetail {
		return {
			id: 1,
			name: "My App",
			slug: "my-app",
			summary: "s",
			bucket: PlatformBucket.iOS,
			platformTags: [PlatformTag.iOS],
			role: null,
			accentColor: null,
			icon: null,
			cardImage: null,
			ogImage: null,
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
