import { unstable_cache } from "next/cache"
import { cache } from "react"
import { prisma } from "@/lib/db"

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

/** Returns a project with its sections (and section images) and links, or null if not found. */
export function getProjectBySlug(slug: string): Promise<ProjectDetail | null> {
	return unstable_cache(
		() =>
			prisma.project.findUnique({
				where: { slug },
				include: projectInclude,
			}),
		[`project-${slug}`],
		{ tags: [`project-${slug}`, "projects"] }
	)()
}

/**
 * Request-scoped dedupe around `getProjectBySlug` so `generateMetadata` and
 * the page body share one fetch per render.
 */
export const loadProject = cache(async (slug: string) => getProjectBySlug(slug))
