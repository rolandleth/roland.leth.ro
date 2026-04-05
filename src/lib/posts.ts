import { prisma } from "@/lib/db"
import { currentDatetimeString } from "@/lib/format"

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

export async function getPostsBySection(
	section: string,
	page: number = 1
): Promise<{ posts: PostListItem[]; totalPages: number }> {
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

export async function getPostBySlug(
	section: string,
	slug: string
): Promise<PostDetail | null> {
	return prisma.post.findUnique({
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
	})
}

export interface PostArchiveItem {
	title: string
	slug: string
	section: string
	datetime: string
}

/** Returns all published posts for a section grouped by year, newest year first. */
export async function getPostsGroupedByYear(
	section: string
): Promise<Record<string, PostArchiveItem[]>> {
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
