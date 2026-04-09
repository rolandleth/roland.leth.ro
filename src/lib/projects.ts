import { unstable_cache } from "next/cache"
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

/** Returns a project with its sections (and section images) and links, or null if not found. */
export function getProjectBySlug(slug: string): Promise<ProjectDetail | null> {
	return unstable_cache(
		() =>
			prisma.project.findUnique({
				where: { slug },
				include: {
					sections: {
						orderBy: { sortOrder: "asc" },
						include: {
							images: {
								orderBy: { sortOrder: "asc" },
							},
						},
					},
					links: {
						orderBy: { sortOrder: "asc" },
					},
				},
			}),
		[`project-${slug}`],
		{ tags: [`project-${slug}`, "projects"] }
	)()
}
