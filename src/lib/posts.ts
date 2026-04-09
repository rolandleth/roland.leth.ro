import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/db"
import { currentDatetimeString } from "@/lib/format"
import { SECTIONS } from "@/lib/sections"

export const PAGE_SIZE = 10

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
 * Creates a cached fetcher for the first page of blog posts scoped to a single section.
 * Each section gets its own cache entry and tag so revalidation is precise:
 * invalidating `blog-tech` only busts the tech section, not life, and vice versa.
 */
function makeBlogPage1Cache(section: string) {
	return unstable_cache(
		async () => {
			const now = currentDatetimeString()
			const where = { section, published: true, datetime: { lte: now } }

			const [posts, total] = await Promise.all([
				prisma.post.findMany({
					where,
					select: {
						id: true,
						title: true,
						slug: true,
						section: true,
						datetime: true,
						body: true,
						readingTime: true,
					},
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

const blogPage1Cache = Object.fromEntries(
	SECTIONS.map((section) => [section, makeBlogPage1Cache(section)])
) as Record<string, ReturnType<typeof makeBlogPage1Cache>>

export async function getPostsBySection(
	section: string,
	page: number = 1
): Promise<{ posts: PostListItem[]; totalPages: number }> {
	if (page === 1 && section in blogPage1Cache) {
		return blogPage1Cache[section]()
	}

	const now = currentDatetimeString()

	const where = {
		section,
		published: true,
		datetime: { lte: now },
	}

	const [posts, total] = await Promise.all([
		prisma.post.findMany({
			where,
			select: {
				id: true,
				title: true,
				slug: true,
				section: true,
				datetime: true,
				body: true,
				readingTime: true,
			},
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
	section: string,
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
function makeArchiveCache(section: string) {
	return unstable_cache(
		async () => {
			const now = currentDatetimeString()

			const posts = await prisma.post.findMany({
				where: { section, published: true, datetime: { lte: now } },
				select: { title: true, slug: true, section: true, datetime: true },
				orderBy: { datetime: "desc" },
			})

			const groups: Record<string, PostArchiveItem[]> = {}

			for (const post of posts) {
				const year = post.datetime.slice(0, 4)

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

const archiveCache = Object.fromEntries(
	SECTIONS.map((section) => [section, makeArchiveCache(section)])
) as Record<string, ReturnType<typeof makeArchiveCache>>

/** Returns all published posts for a section grouped by year, newest year first. */
export function getPostsGroupedByYear(
	section: string
): Promise<Record<string, PostArchiveItem[]>> {
	if (section in archiveCache) {
		return archiveCache[section]()
	}

	return makeArchiveCache(section)()
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
	section: string,
	query: string
): Promise<PostSearchResult[]> {
	const now = currentDatetimeString()
	const term = query.trim().toLowerCase()

	const posts = await prisma.post.findMany({
		where: { section, published: true, datetime: { lte: now } },
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

	return posts.filter(
		(p) =>
			p.title.toLowerCase().includes(term) ||
			p.body.toLowerCase().includes(term)
	)
}
