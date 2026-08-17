import { revalidateTag, unstable_cache } from "next/cache"
import { cache } from "react"
import { createBoundedWrapperCache } from "@/lib/db/boundedCache"
import { wrapNullableDetail } from "@/lib/db/cacheMiss"
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

// One `unstable_cache` wrapper per (section, page), built lazily and reused.
// Bounded because `page` reaches this from a URL segment: without a cap, a
// crawler walking `/blog/tech/p/999999` would mint a wrapper per probe.
const blogPageWrappers =
	createBoundedWrapperCache<
		() => Promise<{ posts: PostListItem[]; totalPages: number }>
	>()

/**
 * Creates a cached fetcher for one page of one section. Each (section, page)
 * gets its own cache entry, all tagged `blog-{section}` so revalidation stays
 * precise: busting `blog-tech` clears every tech page and leaves life alone.
 *
 * `now` is captured INSIDE the cached function, so it freezes at generation
 * time along with the rest of the payload. That's deliberate. The blog list is
 * prerendered, so there is no per-request code left to re-evaluate a filter —
 * the previous design cached a `PAGE_SIZE + futureCount` superset and filtered
 * `datetime <= now` at read time, which only worked while the route rendered
 * per request. `/api/cron/revalidate-scheduled` now busts `blog-{section}` when
 * a post comes due, which is what moves a scheduled post onto the list.
 *
 * Filtering in SQL rather than after the fact also removes the offset
 * arithmetic the superset needed: future-dated posts sort to the head of a
 * `datetime desc` list, so a read-time filter shifts every page boundary by the
 * scheduled-post count. `publishedWhere` excludes them before `skip` applies,
 * and the page boundaries are then just multiples of `PAGE_SIZE`.
 */
function makeBlogPageCache(section: Section, page: number) {
	return unstable_cache(
		async () => {
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

			return { posts, totalPages: Math.ceil(total / PAGE_SIZE) }
		},
		[`blog-page-${section}-${page}`],
		{ tags: [`blog-${section}`] }
	)
}

/**
 * Fetches a page of posts for a section. Callers are responsible for passing
 * a sane `page` (>= 1, integer) — always route through `parsePageParam` at the
 * route boundary. This function does not clamp, to surface misuse early.
 *
 * `totalPages` reflects the live post count as of the last cache generation.
 * A page past the end returns an empty `posts` array rather than throwing;
 * the route is responsible for turning that into a 404 (see the blog list
 * pages), which matters now that these pages are prerendered and a deletion
 * can strand a page that used to exist.
 */
export async function getPostsBySection(
	section: Section,
	page: number = 1
): Promise<{ posts: PostListItem[]; totalPages: number }> {
	const fetchPage = blogPageWrappers.get(`${section}-${page}`, () =>
		makeBlogPageCache(section, page)
	)

	return fetchPage()
}

/**
 * Single source for the per-post detail tag, shared by the `unstable_cache`
 * wrapper below and the revalidation helpers at the bottom of this file. If the
 * two ever drift, targeted busts stop reaching existing entries and a stale
 * page (or stale 404) survives every per-post revalidation — the failure class
 * behind the 2026-07 stale-404 incident.
 */
function postTag(section: Section, slug: string): string {
	return `post-${section}-${slug}`
}

/** Rides on every post detail wrapper; busted only by `revalidateAllPosts`. */
const POST_PAGES_TAG = "post-pages"

/**
 * Aggregate tag on the cross-post list/feed caches, busted by any post mutation.
 * Single-sourced so the cache-side tag and the revalidation-side bust can't drift.
 */
const POSTS_TAG = "posts"

// One cache wrapper per (section, slug) pair, built lazily on first access and
// reused for every subsequent call. This preserves the per-post tag used by
// targeted revalidation while avoiding the "new wrapper per call" cost and
// the revalidation log noise that causes. Capped via `createBoundedWrapperCache`
// so 404 probes (arbitrary slugs) can't grow the map unbounded.
const postBySlugWrappers =
	createBoundedWrapperCache<() => Promise<PostDetail>>()

export async function getPostBySlug(
	section: Section,
	slug: string
): Promise<PostDetail | null> {
	const post = await wrapNullableDetail(
		postBySlugWrappers,
		`${section}:${slug}`,
		// `findFirst` (not `findUnique`) so `published: true` can be enforced at
		// the query boundary; otherwise the canonical post URL would serve drafts.
		// The `datetime <= now` check is intentionally NOT here — it's applied to
		// the cached row at read time (below) so a scheduled post auto-surfaces
		// the first request after its `datetime` passes, without a cache bust.
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
		[postTag(section, slug)],
		[postTag(section, slug), POST_PAGES_TAG]
	)

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
	{ tags: [POSTS_TAG] }
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

/** Identifies one post for a targeted detail-tag bust. */
export interface PostRef {
	section: Section
	slug: string
}

/**
 * Published posts whose `datetime` fell inside `(windowStart, now]` — that is,
 * posts that became live during the window without any mutation happening. This
 * is the signal the scheduled-post cron acts on: a post crossing its `datetime`
 * is the one way the live set changes with nothing to hang a `revalidateTag`
 * off.
 *
 * Returns the rows rather than a count because the cron needs both: the length
 * decides whether to bust at all, and the identities let it bust each due post's
 * own detail tag. A count alone left the detail entries untouched — see
 * `revalidatePostDetails` for what that stranded.
 *
 * The comparison is a lexicographic string compare, which matches chronological
 * order for the fixed-width zero-padded `yyyy-MM-dd-HHmm` format (the invariant
 * `isScheduled` documents). Both bounds come from `currentDatetimeString`, so
 * they share its local-time frame.
 *
 * Callers should pass a window WIDER than the cron interval. Overlap costs one
 * redundant revalidation; a gap silently strands a post until the next real
 * mutation.
 */
export async function findPostsBecameLive(
	windowStart: string,
	now: string
): Promise<PostRef[]> {
	return prisma.post.findMany({
		where: {
			published: true,
			datetime: { gt: windowStart, lte: now },
		},
		select: { section: true, slug: true },
	})
}

/**
 * Invalidates every cache tag tied to a blog section so updated posts
 * surface immediately on list, archive, and feed endpoints.
 */
export function revalidatePostSection(section: Section): void {
	revalidateTag(`feed-${section}`, "max")
	revalidateTag(`blog-${section}`, "max")
	revalidateTag(POSTS_TAG, "max")
}

/**
 * Invalidates one post's detail page + `.md` route (its own tag) plus the
 * section aggregates (list, archive, feed, sitemap). Editing one post refreshes
 * only that post's detail page — siblings carry the separate `post-pages` tag,
 * which this path deliberately leaves alone.
 */
export function revalidatePost(section: Section, slug: string): void {
	revalidateTag(postTag(section, slug), "max")
	revalidatePostSection(section)
}

/**
 * Invalidates the detail entries — HTML page and `.md` route alike — for posts
 * that just came due, without touching siblings.
 *
 * Needed because a detail entry can hold a **404**. Both routes are prerendered
 * with no time-based expiry (`initialRevalidateSeconds: false`), and a request
 * for a post that is published but still future-dated renders the not-found
 * result and pins it, tagged `post-{section}-{slug}` + `post-pages`. Nothing in
 * `revalidatePostSection` touches either tag, so once the post came due the URL
 * kept serving that stale 404 until the post was next saved in admin. The
 * section aggregates (list, archive, feed, sitemap) never had this problem —
 * they cache a padded superset and filter at read time.
 *
 * Per-post rather than a blanket `post-pages` bust so a single due post
 * regenerates two entries instead of every post's page and `.md`, matching the
 * per-slug targeting the detail tags exist for.
 */
export function revalidatePostDetails(posts: PostRef[]): void {
	for (const post of posts) {
		revalidateTag(postTag(post.section, post.slug), "max")
	}
}

/**
 * Invalidates every post detail page (via the shared `post-pages` tag) plus the
 * section aggregates. `post-pages` rides only on `loadPost`, and only this
 * "revalidate everything" path busts it — the per-edit aggregate refresh does
 * not, so editing one post never regenerates the rest.
 */
export function revalidateAllPosts(): void {
	revalidateTag(POST_PAGES_TAG, "max")

	for (const section of SECTIONS) {
		revalidatePostSection(section)
	}
}
