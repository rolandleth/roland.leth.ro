import { revalidateTag, unstable_cache } from "next/cache"
import { cache } from "react"
import { Prisma } from "@/generated/prisma/client"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { createBoundedWrapperCache } from "@/lib/db/boundedCache"
import { CacheMissError, nullOnCacheMiss } from "@/lib/db/cacheMiss"
import { prisma } from "@/lib/db/db"
import { PAGE_SIZE } from "@/lib/utils/pagination"

export interface ProjectListItem {
	id: number
	name: string
	slug: string
	bucket: PlatformBucket
	platformTags: PlatformTag[]
	isFeatured: boolean
	isDiscontinued: boolean
	sortOrder: number
	icon: string | null
}

export interface ProjectGalleryItem extends ProjectListItem {
	summary: string
	/**
	 * Resolved card image for list/gallery surfaces: `cardImage ?? ogImage ??
	 * heroImage ?? first section image` (see `resolveCardImage`). Computed by
	 * `toGalleryItem` so every gallery surface shares one precedence rule. The
	 * raw image columns stay on `ProjectDetail` for the detail page.
	 */
	featuredImage: string | null
	accentColor: string | null
	role: string | null
}

/**
 * Render-only pricing shape stored in the `offers` Json column and consumed by
 * the `SoftwareApplication` JSON-LD. Mirrors `projectOfferSchema`; Prisma hands
 * the column back as an untyped `JsonValue`, so `getProjectBySlug` narrows it to
 * this shape (the write path validates it, so the cast is safe).
 */
export interface ProjectOffer {
	name: string
	price: string
	priceCurrency: string
	billingPeriod?: string
	sortOrder?: number
}

export interface ProjectDetail {
	id: number
	name: string
	slug: string
	summary: string
	metaTitle: string | null
	keywords: string[]
	offers: ProjectOffer[] | null
	applicationCategory: string | null
	icon: string | null
	cardImage: string | null
	ogImage: string | null
	heroImage: string | null
	bucket: PlatformBucket
	platformTags: PlatformTag[]
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
	faqs: {
		id: number
		projectId: number
		question: string
		answer: string
		sortOrder: number
	}[]
}

const gallerySelect = {
	id: true,
	name: true,
	slug: true,
	summary: true,
	bucket: true,
	platformTags: true,
	role: true,
	accentColor: true,
	isFeatured: true,
	isDiscontinued: true,
	sortOrder: true,
	icon: true,
	cardImage: true,
	ogImage: true,
	heroImage: true,
	// Only the first image of each section (in sortOrder) — enough to resolve the
	// `firstImage` fallback in `resolveCardImage` without loading entire galleries.
	sections: {
		orderBy: { sortOrder: "asc" as const },
		select: {
			images: {
				orderBy: { sortOrder: "asc" as const },
				take: 1,
				select: { url: true },
			},
		},
	},
} as const

/** Raw row shape returned by a `gallerySelect` query, before resolution. */
type GalleryRow = Prisma.ProjectGetPayload<{ select: typeof gallerySelect }>

/**
 * First image of the first section that has one, in document order. Each
 * section contributes at most its first image (the gallery query takes 1;
 * detail rows are full but we only read the head), so empty leading sections
 * contribute nothing. `sections` must be ordered (sortOrder) for this to be
 * meaningful.
 */
function firstSectionImage(
	sections: { images: { url: string }[] }[]
): string | undefined {
	return sections.flatMap((section) => section.images)[0]?.url
}

/**
 * The list/gallery card image: `cardImage ?? ogImage ?? heroImage ?? first
 * section image`. The dedicated card image wins; the OG image and hero are
 * progressively weaker stand-ins before the first screenshot.
 */
export function resolveCardImage(project: {
	cardImage: string | null
	ogImage: string | null
	heroImage: string | null
	sections: { images: { url: string }[] }[]
}): string | null {
	return (
		project.cardImage ??
		project.ogImage ??
		project.heroImage ??
		firstSectionImage(project.sections) ??
		null
	)
}

/**
 * The social/OG meta image: `ogImage ?? cardImage ?? heroImage ?? first section
 * image`. Mirrors `resolveCardImage` but prefers the purpose-built OG asset —
 * a 1200×630 social card and a small gallery tile aren't always the same image.
 */
export function resolveOgImage(project: {
	ogImage: string | null
	cardImage: string | null
	heroImage: string | null
	sections: { images: { url: string }[] }[]
}): string | null {
	return (
		project.ogImage ??
		project.cardImage ??
		project.heroImage ??
		firstSectionImage(project.sections) ??
		null
	)
}

/**
 * Resolves a raw gallery row into a `ProjectGalleryItem`, collapsing the card
 * image precedence into a single `featuredImage` and dropping the raw image
 * columns the list surfaces don't render.
 */
function toGalleryItem({
	cardImage,
	ogImage,
	heroImage,
	sections,
	...rest
}: GalleryRow): ProjectGalleryItem {
	return {
		...rest,
		featuredImage: resolveCardImage({
			cardImage,
			ogImage,
			heroImage,
			sections,
		}),
	}
}

/**
 * Cached fetcher for the public projects gallery (discontinued projects sorted last).
 * Tagged with `projects` so any project mutation busts this cache.
 */
const projectsGalleryCache = unstable_cache(
	async () =>
		(
			await prisma.project.findMany({
				select: gallerySelect,
				orderBy: [
					{ isDiscontinued: "asc" },
					{ sortOrder: "asc" },
					{ name: "asc" },
				],
			})
		).map(toGalleryItem),
	["projects-gallery"],
	{ tags: ["projects"] }
)

/**
 * Public-gallery fetcher: cached, with discontinued projects sorted last.
 * Use this on every public surface that lists projects.
 */
export async function getProjectsGalleryCached(): Promise<
	ProjectGalleryItem[]
> {
	return projectsGalleryCache()
}

/**
 * Admin fetcher: uncached so edits surface immediately, and ordered by
 * `sortOrder` then `name` only — discontinued projects stay in their authored
 * slot rather than being pushed to the end.
 */
export async function getProjectsForAdmin(): Promise<ProjectGalleryItem[]> {
	const projects = await prisma.project.findMany({
		select: gallerySelect,
		orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
	})

	return projects.map(toGalleryItem)
}

/**
 * Cached list of every project's slug + `updatedAt` for the sitemap.
 * Tagged `projects` so any project mutation busts it alongside the gallery cache.
 */
export const getAllProjectSlugs = unstable_cache(
	async () =>
		prisma.project.findMany({
			select: { slug: true, updatedAt: true },
			orderBy: { sortOrder: "asc" },
		}),
	["all-project-slugs"],
	{ tags: ["projects"] }
)

/** Returns all projects ordered by sortOrder ascending then name. */
export async function getAllProjects(): Promise<ProjectListItem[]> {
	return prisma.project.findMany({
		select: {
			id: true,
			name: true,
			slug: true,
			bucket: true,
			platformTags: true,
			isFeatured: true,
			isDiscontinued: true,
			sortOrder: true,
			icon: true,
		},
		orderBy: [{ isDiscontinued: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
	})
}

// `toSectionCreate` / `toLinkCreate` live in the Next-free `projectMappers`
// module so the import script can reuse them; re-exported here to keep the
// established `@/lib/db/projects` import surface stable for existing callers.
export {
	toFaqCreate,
	toLinkCreate,
	toSectionCreate,
	type ProjectFaqInput,
	type ProjectLinkInput,
	type ProjectSectionInput,
} from "./projectMappers"

/** Prisma `include` clause for fetching sections (with images) and links, ordered by sortOrder. */
export const projectInclude = {
	sections: {
		orderBy: { sortOrder: "asc" as const },
		include: { images: { orderBy: { sortOrder: "asc" as const } } },
	},
	links: { orderBy: { sortOrder: "asc" as const } },
	faqs: { orderBy: { sortOrder: "asc" as const } },
} as const

/**
 * Single source for the per-project detail tag, shared by the `unstable_cache`
 * wrapper below and the revalidation helpers at the bottom of this file. If the
 * two ever drift, targeted busts stop reaching existing entries and a stale
 * page (or stale 404) survives every per-project revalidation — the failure
 * class behind the 2026-07 stale-404 incident.
 */
function projectTag(slug: string): string {
	return `project-${slug}`
}

/** Rides on every project detail wrapper; busted only by `revalidateAllProjects`. */
const PROJECT_PAGES_TAG = "project-pages"

// One cache wrapper per slug, built lazily on first access and reused for every
// subsequent call. Preserves the per-project tag used by targeted revalidation
// while avoiding the "new wrapper per call" cost and the revalidation log
// noise that causes. Capped via `createBoundedWrapperCache` so 404 probes
// (arbitrary slugs) can't grow the map unbounded.
const projectBySlugWrappers =
	createBoundedWrapperCache<() => Promise<ProjectDetail>>()

/** Returns a project with its sections (and section images) and links, or null if not found. */
export function getProjectBySlug(slug: string): Promise<ProjectDetail | null> {
	const wrapper = projectBySlugWrappers.get(slug, () =>
		unstable_cache(
			async () => {
				const row = await prisma.project.findUnique({
					where: { slug },
					include: projectInclude,
				})

				if (row == null) {
					// Thrown, not returned: `unstable_cache` stores only fulfilled
					// results, so a miss is never pinned into the durable cache and a
					// 404 heals on the next request. See `CacheMissError`.
					throw new CacheMissError()
				}

				// Narrow the untyped `offers` Json column to `ProjectOffer[] | null`
				// once, inside the cache, so every consumer gets the typed shape.
				// The write path validates offers against `projectOfferSchema`, so
				// the cast is safe.
				return {
					...row,
					offers: row.offers as unknown as ProjectOffer[] | null,
				}
			},
			[projectTag(slug)],
			{ tags: [projectTag(slug), PROJECT_PAGES_TAG] }
		)
	)

	return nullOnCacheMiss(wrapper)
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
		const projects = await getProjectsForAdmin()

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
		projects: projects.map(toGalleryItem),
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

/**
 * Invalidates one project's detail page (`project-${slug}`) plus the gallery,
 * `llms.txt`, and sitemap (`projects`). Pass the current OR previous slug on a
 * slug-changing PUT. Does NOT touch other project detail pages — those carry
 * the separate `project-pages` tag, busted only by `revalidateAllProjects`.
 */
export function revalidateProject(slug: string): void {
	revalidateTag("projects", "max")
	revalidateTag(projectTag(slug), "max")
}

/**
 * Invalidates every project cache in one shot: every detail page (via the
 * shared `project-pages` tag, which only this path busts) plus the gallery,
 * `llms.txt`, and sitemap (`projects`). Used by the admin revalidate endpoint's
 * "all projects" action after script imports, which write via Prisma directly
 * and can't bust tags themselves.
 */
export function revalidateAllProjects(): void {
	revalidateTag(PROJECT_PAGES_TAG, "max")
	revalidateTag("projects", "max")
}
