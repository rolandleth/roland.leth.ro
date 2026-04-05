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

/** Returns all projects with gallery fields ordered by sortOrder ascending then name. */
export async function getAllProjectsForGallery(): Promise<
	ProjectGalleryItem[]
> {
	return prisma.project.findMany({
		select: {
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
		},
		orderBy: [{ isDiscontinued: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
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
export async function getProjectBySlug(
	slug: string
): Promise<ProjectDetail | null> {
	return prisma.project.findUnique({
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
	})
}
