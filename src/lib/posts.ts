import { revalidateTag, unstable_cache } from "next/cache"
import { cache } from "react"
import { prisma } from "@/lib/db"
import { currentDatetimeString, yearFromDatetime } from "@/lib/format"
import { SECTIONS, type Section } from "@/lib/sections"

export const PAGE_SIZE = 10

function publishedWhere(section: Section, now: string) {
	return { section, published: true, datetime: { lte: now } }
}

export const postListItemSelect = {
	id: true,
	title: true,
	slug: true,
	section: true,
	datetime: true,
	body: true,
	readingTime: true,
} as const

const postArchiveItemSelect = {
	title: true,
	slug: true,
	section: true,
	datetime: true,
} as const

export interface PostListItem {
	id: number
	title: string
	slug: string
	section: string
	datetime: string
	body: string
	readingTime: string | null
}

export interface PostDetail {
	id: number
	title: string
	slug: string
	section: string
	datetime: string
	body: string
	summary: string | null
	imageUrl: string | null
	readingTime: string | null
}

/**
 * Builds a per-section record by applying `fn` to each known `Section`.
 * Used to avoid repeating `Object.fromEntries(SECTIONS.map(...))` with casts.
 */
export function bySection<T>(fn: (section: Section) => T): Record<Section, T> {
	const entries = SECTIONS.map((section) => [section, fn(section)] as const)

	return Object.fromEntries(entries) as Record<Section, T>
}

/**
 * Creates a cached fetcher for the first page of blog posts scoped to a single section.
 * Each section gets its own cache entry and tag so revalidation is precise:
 * invalidating `blog-tech` only busts the tech section, not life, and vice versa.
 */
function makeBlogPage1Cache(section: Section) {
	return unstable_cache(
		async () => {
			const now = currentDatetimeString()
			const where = publishedWhere(section, now)

			const [posts, total] = await Promise.all([
				prisma.post.findMany({
					where,
					select: postListItemSelect,
					orderBy: { datetime: "desc" },
					skip: 0,
					take: PAGE_SIZE,
				}),
				prisma.post.count({ where }),
			])

			return { posts, totalPages: Math.ceil(total / PAGE_SIZE) }
		},
		[`blog-page1-${section}`],
		{ tags: [`blog-${section}`] }
	)
}

const blogPage1Cache = bySection(makeBlogPage1Cache)

export async function getPostsBySection(
	section: Section,
	page: number = 1
): Promise<{ posts: PostListItem[]; totalPages: number }> {
	if (page === 1) {
		return blogPage1Cache[section]()
	}

	const now = currentDatetimeString()
	const where = publishedWhere(section, now)

	const [posts, total] = await Promise.all([
		prisma.post.findMany({
			where,
			select: postListItemSelect,
			orderBy: { datetime: "desc" },
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
		}),
		prisma.post.count({ where }),
	])

	return {
		posts,
		totalPages: Math.ceil(total / PAGE_SIZE),
	}
}

export function getPostBySlug(
	section: Section,
	slug: string
): Promise<PostDetail | null> {
	return unstable_cache(
		() =>
			prisma.post.findUnique({
				where: { section_slug: { section, slug } },
				select: {
					id: true,
					title: true,
					slug: true,
					section: true,
					datetime: true,
					body: true,
					summary: true,
					imageUrl: true,
					readingTime: true,
				},
			}),
		[`post-${section}-${slug}`],
		{ tags: [`post-${section}-${slug}`, `blog-${section}`] }
	)()
}

/**
 * Request-scoped dedupe around `getPostBySlug` so multiple callers in a single
 * render pass (e.g. `generateMetadata` + the page body) share one DB hit.
 */
export const loadPost = cache(async (section: Section, slug: string) =>
	getPostBySlug(section, slug)
)

/**
 * Cached list of every published post's slug/section/datetime/updatedAt for use
 * by `generateStaticParams` and the sitemap. Tagged `posts` so post mutations
 * bust this alongside section-scoped caches.
 */
export const getAllPublishedPostSlugs = unstable_cache(
	async () =>
		prisma.post.findMany({
			where: { published: true },
			select: {
				slug: true,
				section: true,
				datetime: true,
				updatedAt: true,
			},
			orderBy: { datetime: "desc" },
		}),
	["all-published-post-slugs"],
	{ tags: ["posts"] }
)

export interface PostArchiveItem {
	title: string
	slug: string
	section: string
	datetime: string
}

/**
 * Creates a cached fetcher for the archive page scoped to a single section.
 * Tagged with both `blog-archive-{section}` and `blog-{section}` so that any
 * post mutation (which revalidates `blog-{section}`) also busts the archive.
 */
function makeArchiveCache(section: Section) {
	return unstable_cache(
		async () => {
			const now = currentDatetimeString()

			const posts = await prisma.post.findMany({
				where: publishedWhere(section, now),
				select: postArchiveItemSelect,
				orderBy: { datetime: "desc" },
			})

			const groups: Record<string, PostArchiveItem[]> = {}

			for (const post of posts) {
				const year = yearFromDatetime(post.datetime)

				if (!groups[year]) {
					groups[year] = []
				}

				groups[year].push(post)
			}

			return groups
		},
		[`blog-archive-${section}`],
		{ tags: [`blog-archive-${section}`, `blog-${section}`] }
	)
}

const archiveCache = bySection(makeArchiveCache)

/** Returns all published posts for a section grouped by year, newest year first. */
export function getPostsGroupedByYear(
	section: Section
): Promise<Record<string, PostArchiveItem[]>> {
	return archiveCache[section]()
}

export interface PostSearchResult {
	title: string
	slug: string
	section: string
	datetime: string
	readingTime: string | null
	body: string
}

/** Full-text search across title and body for published posts in a section. */
export async function searchPosts(
	section: Section,
	query: string
): Promise<PostSearchResult[]> {
	const term = query.trim()

	if (term.length === 0) {
		return []
	}

	const now = currentDatetimeString()

	return prisma.post.findMany({
		where: {
			AND: [
				publishedWhere(section, now),
				{
					OR: [
						{ title: { contains: term, mode: "insensitive" } },
						{ body: { contains: term, mode: "insensitive" } },
					],
				},
			],
		},
		select: {
			title: true,
			slug: true,
			section: true,
			datetime: true,
			readingTime: true,
			body: true,
		},
		orderBy: { datetime: "desc" },
	})
}

/**
 * Invalidates every cache tag tied to a blog section so updated posts
 * surface immediately on list, archive, and feed endpoints.
 */
export function revalidatePostSection(section: Section): void {
	revalidateTag(`feed-${section}`, "max")
	revalidateTag(`blog-${section}`, "max")
	revalidateTag("posts", "max")
}
