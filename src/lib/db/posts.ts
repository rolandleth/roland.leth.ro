import { revalidateTag, unstable_cache } from "next/cache"
import { cache } from "react"
import { createBoundedWrapperCache } from "@/lib/db/boundedCache"
import { prisma } from "@/lib/db/db"
import { SECTIONS, type Section } from "@/lib/db/sections"
import { currentDatetimeString, yearFromDatetime } from "@/lib/utils/format"
import { PAGE_SIZE } from "@/lib/utils/pagination"

function publishedWhere(section: Section, now: string) {
	return { section, published: true, datetime: { lte: now } }
}

// `body` is carried on list queries because `PostCard` renders a markdown
// preview (via `truncateBody` + `PostMarkdownContent`) and the reading-time
// fallback reads from it. A plain-text excerpt column would break the markdown
// preview; preserving that UX via a write-time `preview` + `isPreviewTruncated`
// pair costs two new columns + a backfill for a <100KB-per-list-render win at
// current volumes. Revisit when post count or average body size grows enough
// that the list payload becomes measurably slow.
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
	section: Section
	datetime: string
	body: string
	readingTime: string | null
}

export interface PostDetail {
	id: number
	title: string
	slug: string
	section: Section
	datetime: string
	body: string
	summary: string
	imageUrl: string | null
	readingTime: string | null
	updatedAt: Date
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
 *
 * The cached payload is padded by the current scheduled-post count: we take
 * `PAGE_SIZE + futureCount` rows so that the read path can filter `datetime
 * <= now` and still slice a full `PAGE_SIZE`. Scheduled posts therefore live
 * inside the cache and auto-surface the first request after their `datetime`
 * passes — no cron, no manual revalidate. Adding/editing a post still busts
 * the cache via `revalidatePostSection`, which is how new future posts get
 * picked up into the padding window.
 */
function makeBlogPage1Cache(section: Section) {
	return unstable_cache(
		async () => {
			const futureCount = await prisma.post.count({
				where: {
					section,
					published: true,
					datetime: { gt: currentDatetimeString() },
				},
			})

			return prisma.post.findMany({
				where: { section, published: true },
				select: postListItemSelect,
				orderBy: { datetime: "desc" },
				take: PAGE_SIZE + futureCount,
			})
		},
		[`blog-page1-${section}`],
		{ tags: [`blog-${section}`] }
	)
}

const blogPage1Cache = bySection(makeBlogPage1Cache)

/**
 * Fetches a page of posts for a section. Callers are responsible for passing
 * a sane `page` (>= 1, integer) — always route through `parsePageParam` at the
 * route boundary. This function does not clamp, to surface misuse early.
 *
 * `totalPages` is computed from a request-time count of live posts so it
 * stays accurate as scheduled posts cross their `datetime` boundary; a stale
 * cached count would leave the last page inaccessible until the next bust.
 */
export async function getPostsBySection(
	section: Section,
	page: number = 1
): Promise<{ posts: PostListItem[]; totalPages: number }> {
	const now = currentDatetimeString()
	const where = publishedWhere(section, now)

	if (page === 1) {
		const [cached, total] = await Promise.all([
			blogPage1Cache[section](),
			prisma.post.count({ where }),
		])

		const posts = cached
			.filter((post) => post.datetime <= now)
			.slice(0, PAGE_SIZE)

		return { posts, totalPages: Math.ceil(total / PAGE_SIZE) }
	}

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

// One cache wrapper per (section, slug) pair, built lazily on first access and
// reused for every subsequent call. This preserves the per-post tag used by
// targeted revalidation while avoiding the "new wrapper per call" cost and
// the revalidation log noise that causes. Capped via `createBoundedWrapperCache`
// so 404 probes (arbitrary slugs) can't grow the map unbounded.
const postBySlugWrappers =
	createBoundedWrapperCache<() => Promise<PostDetail | null>>()

export async function getPostBySlug(
	section: Section,
	slug: string
): Promise<PostDetail | null> {
	const key = `${section}:${slug}`
	const wrapper = postBySlugWrappers.get(key, () =>
		unstable_cache(
			// `findFirst` (not `findUnique`) so `published: true` can be enforced
			// at the query boundary; otherwise the canonical post URL would
			// serve drafts. The `datetime <= now` check is intentionally NOT
			// here — it's applied to the cached row at read time so a scheduled
			// post auto-surfaces the first request after its `datetime` passes,
			// without a cache bust.
			() =>
				prisma.post.findFirst({
					where: { section, slug, published: true },
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
						updatedAt: true,
					},
				}),
			[`post-${section}-${slug}`],
			{ tags: [`post-${section}-${slug}`, "post-pages"] }
		)
	)

	const post = await wrapper()

	if (!post) {
		return null
	}

	const now = currentDatetimeString()

	return post.datetime <= now ? post : null
}

/**
 * Request-scoped dedupe around `getPostBySlug` so multiple callers in a single
 * render pass (e.g. `generateMetadata` + the page body) share one DB hit.
 */
export const loadPost = cache(async (section: Section, slug: string) =>
	getPostBySlug(section, slug)
)

/**
 * Request-scoped dedupe for the admin edit page, where `generateMetadata` and
 * the page body both need the full row (including drafts). Unlike the public
 * `loadPost`, this hits the DB directly without tag-based caching.
 */
export const loadPostForAdmin = cache(async (id: number) =>
	prisma.post.findUnique({ where: { id } })
)

const adminPostListItemSelect = {
	...postListItemSelect,
	published: true,
} as const

export interface AdminPostListItem extends PostListItem {
	published: boolean
}

export interface AdminPostListResult {
	posts: AdminPostListItem[]
	totalCount: number
	totalPages: number
}

/**
 * Fetches posts for the admin dashboard, across all sections and including drafts.
 * When `query` is non-empty, matches title OR body case-insensitively (mirrors `searchPosts`).
 * Paginated at `PAGE_SIZE` in both modes so `totalPages` is always meaningful.
 */
export async function listPostsForAdmin({
	query,
	page,
}: {
	query?: string
	page: number
}): Promise<AdminPostListResult> {
	const term = query?.trim() ?? ""
	const isSearching = term.length > 0

	const where = isSearching
		? {
				OR: [
					{ title: { contains: term, mode: "insensitive" as const } },
					{ body: { contains: term, mode: "insensitive" as const } },
				],
			}
		: {}

	const [posts, totalCount] = await Promise.all([
		prisma.post.findMany({
			where,
			select: adminPostListItemSelect,
			orderBy: { datetime: "desc" },
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
		}),
		prisma.post.count({ where }),
	])

	return {
		posts,
		totalCount,
		totalPages: Math.ceil(totalCount / PAGE_SIZE),
	}
}

/**
 * Cached list of every published post's slug/section/datetime/updatedAt,
 * including scheduled (future-dated) rows. The public-facing
 * `getAllPublishedPostSlugs` filters by `datetime <= now` at read time so
 * scheduled posts stay out of the sitemap / `generateStaticParams` until
 * their `datetime` passes, then auto-surface without waiting for a cache
 * bust. Tagged `posts` so post mutations bust this alongside section-scoped
 * caches.
 */
const allPublishedPostSlugsCache = unstable_cache(
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

export async function getAllPublishedPostSlugs() {
	const slugs = await allPublishedPostSlugsCache()
	const now = currentDatetimeString()

	return slugs.filter((post) => post.datetime <= now)
}

export interface PostArchiveItem {
	title: string
	slug: string
	section: Section
	datetime: string
}

/**
 * Creates a cached fetcher for the archive page scoped to a single section.
 * Tagged with both `blog-archive-{section}` and `blog-{section}` so that any
 * post mutation (which revalidates `blog-{section}`) also busts the archive.
 *
 * Caches the raw published list including scheduled posts; year-grouping and
 * `datetime <= now` filtering happen at read time in `getPostsGroupedByYear`
 * so scheduled posts auto-surface in the archive as their `datetime` passes.
 */
function makeArchiveCache(section: Section) {
	return unstable_cache(
		async () =>
			prisma.post.findMany({
				where: { section, published: true },
				select: postArchiveItemSelect,
				orderBy: { datetime: "desc" },
			}),
		[`blog-archive-${section}`],
		{ tags: [`blog-archive-${section}`, `blog-${section}`] }
	)
}

const archiveCache = bySection(makeArchiveCache)

/** Returns all published posts for a section grouped by year, newest year first. */
export async function getPostsGroupedByYear(
	section: Section
): Promise<Record<string, PostArchiveItem[]>> {
	const posts = await archiveCache[section]()
	const now = currentDatetimeString()

	const groups: Record<string, PostArchiveItem[]> = {}

	for (const post of posts) {
		if (post.datetime > now) {
			continue
		}

		const year = yearFromDatetime(post.datetime)

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
	section: Section
	datetime: string
	readingTime: string | null
	body: string
}

// Below this length, the ILIKE substring scan over `body` is essentially a
// full-table scan with millions of needless comparisons. Two characters is the
// shortest term that produces meaningful matches (single letters generate
// thousands of hits anyway).
const MIN_SEARCH_TERM_LENGTH = 2

/** Full-text search across title and body for published posts in a section. */
export async function searchPosts(
	section: Section,
	query: string
): Promise<PostSearchResult[]> {
	const term = query.trim()

	if (term.length < MIN_SEARCH_TERM_LENGTH) {
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

/**
 * Invalidates one post's detail page + `.md` route (its own tag) plus the
 * section aggregates (list, archive, feed, sitemap). Editing one post refreshes
 * only that post's detail page — siblings carry the separate `post-pages` tag,
 * which this path deliberately leaves alone.
 */
export function revalidatePost(section: Section, slug: string): void {
	revalidateTag(`post-${section}-${slug}`, "max")
	revalidatePostSection(section)
}

/**
 * Invalidates every post detail page (via the shared `post-pages` tag) plus the
 * section aggregates. `post-pages` rides only on `loadPost`, and only this
 * "revalidate everything" path busts it — the per-edit aggregate refresh does
 * not, so editing one post never regenerates the rest.
 */
export function revalidateAllPosts(): void {
	revalidateTag("post-pages", "max")

	for (const section of SECTIONS) {
		revalidatePostSection(section)
	}
}
