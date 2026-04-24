import { unstable_cache } from "next/cache"
import { cache } from "react"
import { createBoundedWrapperCache } from "@/lib/boundedCache"
import { prisma } from "@/lib/db"
import { PAGE_SIZE } from "@/lib/pagination"

export interface ProjectListItem {
	id: number
	name: string
	slug: string
	platform: string
	isFeatured: boolean
	isDiscontinued: boolean
	sortOrder: number
	icon: string | null
}

export interface ProjectGalleryItem extends ProjectListItem {
	summary: string
	heroImage: string | null
	accentColor: string | null
	role: string | null
}

export interface ProjectDetail {
	id: number
	name: string
	slug: string
	summary: string
	icon: string | null
	heroImage: string | null
	platform: string
	role: string | null
	accentColor: string | null
	isFeatured: boolean
	isDiscontinued: boolean
	date: string | null
	sortOrder: number
	createdAt: Date
	updatedAt: Date
	sections: {
		id: number
		projectId: number
		title: string
		description: string
		sortOrder: number
		images: {
			id: number
			sectionId: number
			url: string
			caption: string | null
			sortOrder: number
		}[]
	}[]
	links: {
		id: number
		projectId: number
		label: string
		url: string
		sortOrder: number
	}[]
}

const gallerySelect = {
	id: true,
	name: true,
	slug: true,
	summary: true,
	platform: true,
	role: true,
	accentColor: true,
	isFeatured: true,
	isDiscontinued: true,
	sortOrder: true,
	icon: true,
	heroImage: true,
} as const

/**
 * Cached fetcher for the public projects gallery (discontinued projects sorted last).
 * Tagged with `projects` so any project mutation busts this cache.
 */
const projectsGalleryCache = unstable_cache(
	() =>
		prisma.project.findMany({
			select: gallerySelect,
			orderBy: [
				{ isDiscontinued: "asc" },
				{ sortOrder: "asc" },
				{ name: "asc" },
			],
		}),
	["projects-gallery"],
	{ tags: ["projects"] }
)

/**
 * Returns all projects with gallery fields.
 * The default (public) call is cached; passing `sortDiscontinued: false` (admin use)
 * bypasses the cache and hits the DB directly.
 */
export async function getAllProjectsForGallery({
	sortDiscontinued = true,
}: { sortDiscontinued?: boolean } = {}): Promise<ProjectGalleryItem[]> {
	if (sortDiscontinued) {
		return projectsGalleryCache()
	}

	return prisma.project.findMany({
		select: gallerySelect,
		orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
	})
}

/** Returns all projects ordered by sortOrder ascending then name. */
export async function getAllProjects(): Promise<ProjectListItem[]> {
	return prisma.project.findMany({
		select: {
			id: true,
			name: true,
			slug: true,
			platform: true,
			isFeatured: true,
			isDiscontinued: true,
			sortOrder: true,
			icon: true,
		},
		orderBy: [{ isDiscontinued: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
	})
}

export type ProjectSectionInput = {
	title: string
	description: string
	sortOrder?: number
	images?: { url: string; caption?: string | null; sortOrder?: number }[]
}

export type ProjectLinkInput = {
	label: string
	url: string
	sortOrder?: number
}

/**
 * Maps validated section inputs into a Prisma nested-create clause,
 * defaulting `sortOrder` and nested image fields so callers don't have to.
 */
export function toSectionCreate(sections: ProjectSectionInput[] | undefined) {
	if (sections == null) {
		return undefined
	}

	return {
		create: sections.map((s) => ({
			title: s.title,
			description: s.description,
			sortOrder: s.sortOrder ?? 0,
			images: s.images
				? {
						create: s.images.map((img) => ({
							url: img.url,
							caption: img.caption ?? null,
							sortOrder: img.sortOrder ?? 0,
						})),
					}
				: undefined,
		})),
	}
}

/**
 * Maps validated link inputs into a Prisma nested-create clause,
 * defaulting `sortOrder` so callers don't have to.
 */
export function toLinkCreate(links: ProjectLinkInput[] | undefined) {
	if (links == null) {
		return undefined
	}

	return {
		create: links.map((l) => ({
			label: l.label,
			url: l.url,
			sortOrder: l.sortOrder ?? 0,
		})),
	}
}

/** Prisma `include` clause for fetching sections (with images) and links, ordered by sortOrder. */
export const projectInclude = {
	sections: {
		orderBy: { sortOrder: "asc" as const },
		include: { images: { orderBy: { sortOrder: "asc" as const } } },
	},
	links: { orderBy: { sortOrder: "asc" as const } },
} as const

// One cache wrapper per slug, built lazily on first access and reused for every
// subsequent call. Preserves the per-project tag used by targeted revalidation
// while avoiding the "new wrapper per call" cost and the revalidation log
// noise that causes. Capped via `createBoundedWrapperCache` so 404 probes
// (arbitrary slugs) can't grow the map unbounded.
const projectBySlugWrappers =
	createBoundedWrapperCache<() => Promise<ProjectDetail | null>>()

/** Returns a project with its sections (and section images) and links, or null if not found. */
export function getProjectBySlug(slug: string): Promise<ProjectDetail | null> {
	const wrapper = projectBySlugWrappers.get(slug, () =>
		unstable_cache(
			() =>
				prisma.project.findUnique({
					where: { slug },
					include: projectInclude,
				}),
			[`project-${slug}`],
			{ tags: [`project-${slug}`, "projects"] }
		)
	)

	return wrapper()
}

/**
 * Request-scoped dedupe around `getProjectBySlug` so `generateMetadata` and
 * the page body share one fetch per render.
 */
export const loadProject = cache(async (slug: string) => getProjectBySlug(slug))

/**
 * Request-scoped dedupe for the admin edit page: both `generateMetadata` and
 * the page body fetch the same row, so React's `cache` collapses them into
 * one DB hit per request. Looked up by numeric id, unlike the public loader.
 */
export const loadProjectForAdmin = cache(async (id: number) =>
	prisma.project.findUnique({ where: { id }, include: projectInclude })
)

export interface AdminProjectListResult {
	projects: ProjectGalleryItem[]
	totalCount: number
	totalPages: number
}

/**
 * Fetches projects for the admin dashboard in the same shape as the public gallery,
 * but without cache or discontinued-last ordering so edits surface immediately.
 * When `query` is non-empty, matches `name` case-insensitively and paginates at
 * `PAGE_SIZE`. When not searching, returns everything (the grouped view
 * shows the full list) and reports `totalPages: 1` so callers can treat it
 * uniformly.
 */
export async function listProjectsForAdmin({
	query,
	page,
}: {
	query?: string
	page: number
}): Promise<AdminProjectListResult> {
	const term = query?.trim() ?? ""
	const isSearching = term.length > 0

	if (!isSearching) {
		const projects = await getAllProjectsForGallery({ sortDiscontinued: false })

		return { projects, totalCount: projects.length, totalPages: 1 }
	}

	const where = { name: { contains: term, mode: "insensitive" as const } }

	const [projects, totalCount] = await Promise.all([
		prisma.project.findMany({
			where,
			select: gallerySelect,
			orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
		}),
		prisma.project.count({ where }),
	])

	return {
		projects,
		totalCount,
		totalPages: Math.ceil(totalCount / PAGE_SIZE),
	}
}

/**
 * Detail row as returned by `loadProjectForAdmin`: `projectInclude` expands sections
 * (with images) and links, which is what the edit form consumes.
 */
export type AdminProjectDetail = NonNullable<
	Awaited<ReturnType<typeof loadProjectForAdmin>>
>

/**
 * Normalizes a DB project row into the shape `ProjectForm` expects.
 * Specifically, image captions are nullable in the DB but the form treats
 * them as plain strings, so null is coerced to "".
 */
export function toProjectFormInitialData(project: AdminProjectDetail) {
	return {
		...project,
		sections: project.sections.map((section) => ({
			...section,
			images: section.images.map((image) => ({
				...image,
				caption: image.caption ?? "",
			})),
		})),
	}
}
