import { revalidateTag, unstable_cache } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	PlatformBucket,
	PlatformTag,
	ProjectPageLayout,
	ProjectProminence,
	ProjectSectionKind,
} from "@/generated/prisma/enums"
import { prisma } from "@/lib/db/db"
import {
	getAllProjects,
	getProjectBySlug,
	getProjectsForAdmin,
	getProjectsGalleryCached,
	listProjectsForAdmin,
	loadProject,
	loadProjectForAdmin,
	resolveCardImage,
	resolveHeroImage,
	resolveOgImage,
	revalidateProject,
	toProjectFormInitialData,
	type AdminProjectDetail,
} from "@/lib/db/projects"
import {
	EMPTY_PRODUCT_PAGE_FIELDS,
	makeProjectListItem,
	textSectionFields,
} from "@/test/fixtures"

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

	it("resolves a blank column past, not as, an image", async () => {
		// The columns are typed `string | null`, so `""` type-checks even though
		// the write-path schemas reject it. A `??` chain would short-circuit on
		// it (`"" ?? next` is `""`) and hand a blank URL to `<img>`/`og:image`
		// instead of falling through to the next rung.
		const rows = [
			makeGalleryRow({
				id: 1,
				cardImage: "",
				ogImage: "   ",
				heroImage: "/hero.png",
				sections: [{ images: [{ url: "/first.png" }] }],
			}),
			makeGalleryRow({
				id: 2,
				cardImage: "",
				ogImage: "",
				heroImage: "",
				sections: [{ images: [{ url: "  " }] }],
			}),
		]
		vi.mocked(prisma.project.findMany).mockResolvedValue(
			rows as unknown as Awaited<ReturnType<typeof prisma.project.findMany>>
		)

		const result = await getProjectsForAdmin()

		expect(result.map((p) => p.featuredImage)).toEqual(["/hero.png", null])
	})

	it("is not wrapped in unstable_cache (admin reads must bypass the cache)", () => {
		// Pin the set of `unstable_cache(...)` wraps registered at module load
		// in projects.ts. The `getProjectBySlug` wrappers are created lazily
		// per-slug at call time, so they don't show up here. If a regression
		// accidentally wraps the admin reader — silently caching admin reads
		// and hiding fresh edits from the admin UI — this set grows.
		expect(cacheWrapsAtLoad).toEqual([
			{
				keys: ["projects-gallery", expect.any(String)],
				tags: ["projects"],
			},
			{ keys: ["all-project-slugs"], tags: ["projects"] },
		])
	})
})

describe("getProjectsGalleryCached cache key", () => {
	it("keys the gallery on its select, so rows from older code are never served", () => {
		// The callback names `gallerySelect` instead of spelling it out, so its
		// source, which `unstable_cache` also keys on, doesn't change with it.
		const [, shape] =
			cacheWrapsAtLoad.find((wrap) => wrap.keys?.[0] === "projects-gallery")
				?.keys ?? []

		// The fields the own-app tiles added.
		for (const field of ['"palette"', '"heroHeadline"', '"links"']) {
			expect(shape).toContain(field)
		}
	})
})

describe("toGalleryItem, through getProjectsForAdmin", () => {
	it("resolves the hero image like the product page and passes the tile fields through", async () => {
		const palette = {
			light: {
				band: "#f3ede4",
				bandInk: "#2a241e",
				bandInk2: "#6b6158",
				bandHighlight: "#9a532b",
				accentText: "#9a532b",
			},
			dark: {
				band: "#2a211b",
				bandInk: "#f3ede4",
				bandInk2: "#c9bbae",
				bandHighlight: "#e0a27a",
				accentText: "#e0a27a",
			},
		}
		const links = [
			{ id: 1, label: "App Store", url: "https://apps.apple.com/app/id1" },
		]
		vi.mocked(prisma.project.findMany).mockResolvedValue([
			{
				...makeGalleryRow({
					cardImage: "/card.png",
					ogImage: "/og.png",
					heroImage: null,
					sections: [{ images: [{ url: "/first.png" }] }],
				}),
				isOwnApp: true,
				heroImageAlt: "The app.",
				heroEyebrow: "Decision journal",
				heroHeadline: "Find out.",
				palette,
				links,
			},
		] as unknown as Awaited<ReturnType<typeof prisma.project.findMany>>)

		const [item] = await getProjectsForAdmin()

		// No hero of its own: the card image, as `resolveHeroImage` picks.
		expect(item.productHeroImage).toBe("/card.png")
		expect(item).toMatchObject({
			isOwnApp: true,
			heroImageAlt: "The app.",
			heroEyebrow: "Decision journal",
			heroHeadline: "Find out.",
			palette,
			links,
		})
		// The raw image columns stay off the item.
		expect(item).not.toHaveProperty("heroImage")
		expect(item).not.toHaveProperty("cardImage")
	})
})

// #endregion

// #region resolveCardImage / resolveOgImage

describe("resolveCardImage / resolveOgImage", () => {
	const sections = [{ images: [{ url: "/first.png" }] }]

	it("differ only in whether cardImage or ogImage wins", () => {
		// The two chains are deliberate mirrors: the gallery tile prefers the
		// dedicated card, the social tag prefers the purpose-built 1200×630 OG
		// asset. Pinned together so one can't be reordered without the other.
		const project = {
			cardImage: "/card.png",
			ogImage: "/og.png",
			heroImage: "/hero.png",
			sections,
		}

		expect(resolveCardImage(project)).toBe("/card.png")
		expect(resolveOgImage(project)).toBe("/og.png")
	})

	it.each([
		["hero", { cardImage: null, ogImage: null }, "/hero.png"],
		["blank card and og", { cardImage: "", ogImage: "  " }, "/hero.png"],
	])("falls through to %s", (_label, images, expected) => {
		const project = { heroImage: "/hero.png", sections, ...images }

		expect(resolveCardImage(project)).toBe(expected)
		expect(resolveOgImage(project)).toBe(expected)
	})

	it("returns null when every rung is absent or blank", () => {
		const project = {
			cardImage: "",
			ogImage: null,
			heroImage: "   ",
			sections: [{ images: [{ url: "" }] }],
		}

		expect(resolveCardImage(project)).toBeNull()
		expect(resolveOgImage(project)).toBeNull()
	})

	it("trims a padded URL rather than passing it through", () => {
		const project = {
			cardImage: "  /card.png  ",
			ogImage: null,
			heroImage: null,
			sections: [],
		}

		expect(resolveCardImage(project)).toBe("/card.png")
	})
})

// #endregion

// #region resolveHeroImage

describe("resolveHeroImage", () => {
	it.each([
		[
			"the hero image",
			{ heroImage: "/hero.png", cardImage: "/card.png", ogImage: "/og.png" },
			"/hero.png",
		],
		[
			"the card image",
			{ heroImage: null, cardImage: "/card.png", ogImage: "/og.png" },
			"/card.png",
		],
		[
			"the OG image",
			{ heroImage: null, cardImage: null, ogImage: "/og.png" },
			"/og.png",
		],
		[
			"the card image past a blank hero",
			{ heroImage: "  ", cardImage: "/card.png", ogImage: null },
			"/card.png",
		],
	])("picks %s", (_label, project, expected) => {
		expect(resolveHeroImage(project)).toBe(expected)
	})

	it("returns null rather than reaching for a section screenshot", () => {
		// The sections show their own screenshots lower on the page; the hero
		// stays text-only rather than repeat one.
		expect(
			resolveHeroImage({ heroImage: null, cardImage: "", ogImage: null })
		).toBeNull()
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
		applicationCategory: null,
		cardImage: null,
		ogImage: null,
		heroImage: null,
		role: null,
		accentColor: null,
		prominence: ProjectProminence.low,
		pageLayout: ProjectPageLayout.portfolio,
		isDiscontinued: false,
		isOwnApp: false,
		...EMPTY_PRODUCT_PAGE_FIELDS,
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

	it("hands the plans and palette Json columns back as stored", async () => {
		const plans = [{ name: "Free", features: ["Meals."], sortOrder: 1 }]
		const theme = {
			band: "#24443a",
			bandInk: "#f4f1e8",
			bandInk2: "#c9d3cc",
			bandHighlight: "#cfa75a",
			accentText: "#2e7d5b",
		}
		vi.mocked(prisma.project.findUnique).mockResolvedValue({
			...fullProject,
			plans,
			palette: { light: theme, dark: theme },
		} as Awaited<ReturnType<typeof prisma.project.findUnique>>)

		const result = await getProjectBySlug("my-app")
		expect(result?.plans).toEqual(plans)
		expect(result?.palette).toEqual({ light: theme, dark: theme })
	})

	it("keys the cache on the row's shape, so an entry in an older shape is never served", async () => {
		// The wrapper's source never changes, so the key parts are all the cache
		// sees. A slug no other test uses: wrappers are built once per slug.
		vi.mocked(prisma.project.findUnique).mockResolvedValue(
			fullProject as Awaited<ReturnType<typeof prisma.project.findUnique>>
		)

		await getProjectBySlug("shape-keyed")

		const [, keyParts] = vi.mocked(unstable_cache).mock.calls.at(-1) ?? []
		const [tag, shape] = keyParts ?? []

		expect(tag).toBe("project-shape-keyed")
		// The columns and the join that sections gained with kinds and steps.
		for (const part of ['"kind"', '"layout"', '"items"', '"itemId"']) {
			expect(shape).toContain(part)
		}
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
			applicationCategory: null,
			cardImage: null,
			ogImage: null,
			heroImage: null,
			role: null,
			accentColor: null,
			prominence: ProjectProminence.low,
			pageLayout: ProjectPageLayout.portfolio,
			isDiscontinued: false,
			isOwnApp: false,
			...EMPTY_PRODUCT_PAGE_FIELDS,
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
		// The form sends steps back as loaded, so a section loaded without them
		// would lose them on the next save.
		expect(call.include).toHaveProperty("sections.include.images")
		expect(call.include).toHaveProperty("sections.include.items.include.images")
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
			metaTitle: null,
			keywords: [],
			offers: null,
			applicationCategory: null,
			bucket: PlatformBucket.iOS,
			platformTags: [PlatformTag.iOS],
			role: null,
			accentColor: null,
			icon: null,
			cardImage: null,
			ogImage: null,
			heroImage: null,
			prominence: ProjectProminence.low,
			pageLayout: ProjectPageLayout.portfolio,
			isDiscontinued: false,
			isOwnApp: false,
			...EMPTY_PRODUCT_PAGE_FIELDS,
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
					...textSectionFields(),
					images: [
						{
							id: 100,
							sectionId: 10,
							url: "https://example.com/a.png",
							caption: null,
							alt: null,
							sortOrder: 0,
						},
						{
							id: 101,
							sectionId: 10,
							url: "https://example.com/b.png",
							caption: "hi",
							alt: null,
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
			faqs: [],
		}
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

	it("coerces null alt text to an empty string and keeps stored alt text", () => {
		const detail = makeAdminDetail()
		detail.sections[0].images[1].alt = "Stored alt."

		const data = toProjectFormInitialData(detail)

		expect(data.sections[0].images[0].alt).toBe("")
		expect(data.sections[0].images[1].alt).toBe("Stored alt.")
	})

	it("passes the kind, the layout and the steps through to the form", () => {
		// The form doesn't edit steps; it sends them back as loaded, so a save
		// from the admin can't drop them.
		const detail = makeAdminDetail()
		const step = {
			id: 300,
			sectionId: 10,
			title: "Log a meal",
			description: "Type it.",
			sortOrder: 0,
			images: [
				{
					id: 400,
					itemId: 300,
					url: "https://example.com/log.png",
					caption: null,
					alt: "The log sheet.",
					sortOrder: 0,
				},
			],
		}
		detail.sections[0] = {
			...detail.sections[0],
			kind: ProjectSectionKind.steps,
			layout: null,
			images: [],
			items: [step],
		}

		const [section] = toProjectFormInitialData(detail).sections

		expect(section.kind).toBe(ProjectSectionKind.steps)
		expect(section.layout).toBeNull()
		expect(section.items).toEqual([step])
	})

	it("preserves top-level project fields untouched", () => {
		const detail = makeAdminDetail()
		const data = toProjectFormInitialData(detail)

		expect(data.id).toBe(detail.id)
		expect(data.name).toBe(detail.name)
		expect(data.slug).toBe(detail.slug)
		expect(data.links).toEqual(detail.links)
	})

	// The form reads `initialData?.isOwnApp ?? false`, so a flag dropped here
	// would show every own app as unticked and clear it on the next save.
	it("carries the placement fields through to the form data", () => {
		const detail = {
			...makeAdminDetail(),
			prominence: ProjectProminence.high,
			pageLayout: ProjectPageLayout.product,
			isDiscontinued: true,
			isOwnApp: true,
		}
		const data = toProjectFormInitialData(detail)

		expect(data.prominence).toBe(ProjectProminence.high)
		expect(data.pageLayout).toBe(ProjectPageLayout.product)
		expect(data.isDiscontinued).toBe(true)
		expect(data.isOwnApp).toBe(true)
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
