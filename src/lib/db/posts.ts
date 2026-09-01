import { revalidateTag, unstable_cache } from "next/cache"
import { cache } from "react"
import { createBoundedWrapperCache } from "@/lib/db/boundedCache"
import { wrapNullableDetail } from "@/lib/db/cacheMiss"
import { prisma } from "@/lib/db/db"
import { SECTIONS, type Section } from "@/lib/db/sections"
import {
	currentDatetimeString,
	isFutureDatetime,
	yearFromDatetime,
} from "@/lib/utils/format"
import { PAGE_SIZE } from "@/lib/utils/pagination"

// "Is this post live yet?" is answered in two places in this file, and the split
// is deliberate but easy to misread. The list and search paths ask Postgres, via
// this `where`. The archive, sitemap, and feed cache a superset of published
// rows and drop the future-dated ones in JS after the cache returns; the guide
// side does the same in `guides.ts`.
//
// Neither form re-runs per request — every one of those surfaces is prerendered,
// so both freeze at generation time. That is what makes
// `/api/cron/revalidate-scheduled` mandatory rather than a nicety: it is the
// only thing that regenerates them when a post crosses its `datetime`. The SQL
// form is the stricter of the two, because it also fixes the page boundaries
// (see `makeBlogPageCache`), so a read-time filter is not a drop-in there.
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
 * Single source for the section-aggregate tag, shared by every cache wrapper
 * and revalidation helper in this file that touches a whole section (list
 * pages, page count, archive, `revalidatePostSection`). Same reasoning as
 * `postTag` below: if a caller drifted from the literal, a bust would stop
 * reaching that cache entry and a stale page — or a stale 404 — would survive
 * every section-level revalidation.
 */
function sectionTag(section: Section): string {
	return `blog-${section}`
}

/**
 * Cache tag for a section's Atom feed. Set on the feed route's own cache entry
 * (`src/app/api/feed/[section]/route.ts`) and busted by `revalidatePostSection`
 * at the bottom of this file — two files that have to agree on the exact
 * string, the same drift shape `sectionTag` above prevents for `blog-{section}`,
 * except this pair crosses a module boundary instead of repeating within one.
 *
 * Lives here beside `sectionTag` rather than in `content/feed.ts` with the
 * feed's other section helpers: every tag in this codebase is minted and busted
 * from the db layer, and putting this one in `content/` made `posts.ts` import
 * from `content/` to revalidate — the db layer reaching up into the content
 * layer for a string it owns. The feed route already imports `bySection` from
 * here, so pulling the tag from the same place costs it no new dependency.
 */
export function feedTag(section: Section): string {
	return `feed-${section}`
}

// One `unstable_cache` wrapper per (section, page), built lazily and reused.
// Bounded because `page` reaches this from a URL segment: without a cap, a
// crawler walking `/blog/tech/p/999999` would mint a wrapper per probe.
//
// The cap bounds THIS map and nothing else. Each distinct page still runs its
// own `findMany` and mints its own on-disk cache entry (the count is now
// shared via `getSectionPageCount`, not run per page — see `makeBlogPageCache`),
// so what limits probe damage is the page bound enforced at the route, not
// this map.
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
 *
 * `totalPages` comes from `getSectionPageCount` rather than a `count()` here.
 * The two used to run independent counts under the same `blog-{section}` tag —
 * same query, two cache entries that regenerate on their own schedules. A bust
 * doesn't repopulate both atomically, so `Pagination` (fed by this cache) could
 * render an "Older" link to a page `isRealPage` (fed by the count cache) still
 * 404s, because one had regenerated and the other hadn't. Routing both through
 * the same cache entry rules out the two DISAGREEING on any single read —
 * whichever value the count cache currently holds is what both consult.
 *
 * It does not make them agree "by construction" in the stronger sense, and the
 * mechanism is worth naming because it isn't visible from the call: the
 * `getSectionPageCount` call below sits INSIDE this `unstable_cache` callback,
 * so it's one cache entry reading another. The callback only runs on a miss —
 * which means a warm entry here returns a `totalPages` FROZEN at its own last
 * generation, not the value the count entry holds now. `isRealPage` reads the
 * count entry directly and sees the current one. Same tag on both, so a bust
 * eventually converges them; between the bust and this entry's regeneration
 * they can differ.
 *
 * So `posts` (from `findMany`, generated fresh whenever this callback runs) and
 * `totalPages` (a snapshot of a value that has its own regeneration schedule)
 * can momentarily disagree, most plausibly right after an unpublish or delete
 * shrinks the real page count. `BlogPostList`'s `page > 1 && posts.length === 0`
 * check is the backstop for exactly that window — see its docblock.
 *
 * The nesting is deliberate and worth keeping: the alternative is a `count()`
 * here, which is the independent-second-entry bug this replaced. Just don't
 * read "shared cache entry" as "shared at read time".
 */
function makeBlogPageCache(section: Section, page: number) {
	return unstable_cache(
		async () => {
			const where = publishedWhere(section, currentDatetimeString())

			const [posts, totalPages] = await Promise.all([
				prisma.post.findMany({
					where,
					select: postListItemSelect,
					orderBy: { datetime: "desc" },
					skip: (page - 1) * PAGE_SIZE,
					take: PAGE_SIZE,
				}),
				getSectionPageCount(section),
			])

			return { posts, totalPages }
		},
		[`blog-page-${section}-${page}`],
		{ tags: [sectionTag(section)] }
	)
}

/**
 * Fetches a page of posts for a section. Callers are responsible for passing
 * a sane `page` (>= 1, integer) — always route through `parsePageParam` at the
 * route boundary. This function does not clamp, to surface misuse early.
 *
 * `totalPages` reflects the live post count as of the last cache generation.
 * A page past the end returns an empty `posts` array rather than throwing.
 * `/p/:page` 404s most out-of-range pages upstream via `isRealPage`, before
 * this runs at all; `BlogPostList` (the shared body both list routes render)
 * converts an empty result into a 404 itself as the backstop for the narrower
 * case `isRealPage` can't catch — a page real at that check, no longer real by
 * the time this ran (see `BlogPostList`'s docblock).
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
 * Count-only page total for a section. One `count`, no rows.
 *
 * Exists because most callers want the page total and nothing else, and reaching
 * it through `getPostsBySection` meant running the page-1 `findMany` with
 * `postListItemSelect` — which carries `body` — and discarding the result.
 * `generateStaticParams` paid that per section on every build; the paginated
 * route pays it on every out-of-range probe, which is precisely when the rows
 * are least wanted. `getPostsBySection` itself now reads its `totalPages`
 * through this same function rather than counting again — see the note on
 * `makeBlogPageCache` for why duplicating the count was a correctness bug, not
 * just redundant work.
 *
 * Its own cache entry rather than a slice of the page cache: the page caches key
 * on (section, page) and this answer is page-independent, so folding it in would
 * either duplicate the count per page or make page 1 special. Shares the
 * `blog-{section}` tag, so the same bust covers both.
 */
function makeSectionPageCountCache(section: Section) {
	return unstable_cache(
		async () => {
			const total = await prisma.post.count({
				where: publishedWhere(section, currentDatetimeString()),
			})

			return Math.ceil(total / PAGE_SIZE)
		},
		[`blog-page-count-${section}`],
		{ tags: [sectionTag(section)] }
	)
}

const sectionPageCountCache = bySection(makeSectionPageCountCache)

/** Total pages in a section, counted without loading a single post body. */
export async function getSectionPageCount(section: Section): Promise<number> {
	return sectionPageCountCache[section]()
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

/**
 * The cached row behind `resolvePost`: the published row regardless of
 * `datetime`, or `null`. The visibility verdict stays with `resolvePost`, so the
 * row is cached once while the post is scheduled and only the clock comparison
 * is recomputed.
 */
function fetchPostRow(
	section: Section,
	slug: string
): Promise<PostDetail | null> {
	return wrapNullableDetail(
		postBySlugWrappers,
		`${section}:${slug}`,
		// `findFirst` (not `findUnique`) so `published: true` can be enforced at
		// the query boundary; otherwise the canonical post URL would serve drafts.
		// The `datetime <= now` check is intentionally NOT here — it's applied to
		// the cached row by `resolvePost`, so the row stays cached while the post is
		// still scheduled and only the visibility verdict is recomputed. That
		// verdict is recomputed on regeneration, not per request: the detail route
		// is prerendered, which is the whole reason `revalidatePostDetails` exists.
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
}

/** The teaser subset a scheduled post's URL is allowed to show before it's live. */
export interface ScheduledPost {
	title: string
	datetime: string
}

/**
 * What a post URL resolves to once the clock is applied: the full row, the
 * teaser a scheduled post may show, or nothing.
 */
export type PostResolution =
	| { status: "live"; post: PostDetail }
	| { status: "scheduled"; scheduled: ScheduledPost }
	| { status: "missing" }

/**
 * Resolves a post URL against ONE reading of the clock.
 *
 * The single reading is the point, not an optimization. Asking "is it live?"
 * and "is it scheduled?" as two calls means two `currentDatetimeString()`
 * reads, and a post crossing its `datetime` in the gap between them answers no
 * to both: the caller falls through to a 404 and — because the detail routes
 * are prerendered — pins it, at the exact moment the post went live. That is
 * the defect the scheduled notice exists to remove, so the resolver refuses to
 * reintroduce it in a one-minute window. Deciding once also keeps
 * `generateMetadata` and the page body from reaching different verdicts in the
 * same render.
 *
 * `isFutureDatetime` carries the comparison (rather than an inline `>`), so
 * "live" and "scheduled" stay exact complements by construction and share the
 * lexicographic-compare invariant that helper documents.
 */
async function resolvePost(
	section: Section,
	slug: string
): Promise<PostResolution> {
	const post = await fetchPostRow(section, slug)

	if (!post) {
		return { status: "missing" }
	}

	if (isFutureDatetime(post.datetime, currentDatetimeString())) {
		return {
			status: "scheduled",
			scheduled: { title: post.title, datetime: post.datetime },
		}
	}

	return { status: "live", post }
}

/**
 * Request-scoped dedupe around `resolvePost` so `generateMetadata` and the page
 * body of one render share a single DB hit and a single verdict. The detail
 * routes read this rather than `getPostBySlug`, because they need to tell
 * "scheduled" apart from "missing" — see `revalidatePostDetails` for the pinned
 * 404 that distinction removes.
 */
export const loadPostResolution = cache(resolvePost)

/**
 * The published, already-live row for a slug, or `null` for anything else
 * (missing, draft, or still scheduled). The narrow accessor for callers that
 * have no scheduled branch to render.
 */
export async function getPostBySlug(
	section: Section,
	slug: string
): Promise<PostDetail | null> {
	const resolved = await resolvePost(section, slug)

	return resolved.status === "live" ? resolved.post : null
}

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
 * scheduled posts stay out of the sitemap / `generateStaticParams` until their
 * `datetime` passes. Tagged `posts` so post mutations bust this alongside the
 * section-scoped caches.
 *
 * "Read time" means generation time, not request time: every consumer here is
 * prerendered, so the filter runs once when the page is built and freezes with
 * it. A post coming due surfaces when something busts the tag — the daily
 * `/api/cron/revalidate-scheduled` run, or any post mutation — never on its own.
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
 * `datetime <= now` filtering happen in `getPostsGroupedByYear` when the entry
 * is generated. The archive page is prerendered, so that filter does not re-run
 * per request — a post coming due reaches the archive when the daily cron busts
 * `blog-{section}`, not by itself.
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
		{ tags: [`blog-archive-${section}`, sectionTag(section)] }
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
 *
 * `limit` bounds the result. A bulk import of backdated posts can drop hundreds
 * inside one window, and an unbounded `findMany` here would load every row so
 * the caller could fire one `revalidateTag` each. The cron asks for one row more
 * than it intends to process individually and switches to a blanket bust when it
 * gets it, so the bound never silently drops a post — see `DUE_ROW_CAP`.
 */
export async function findPostsBecameLive(
	windowStart: string,
	now: string,
	limit: number
): Promise<PostRef[]> {
	return prisma.post.findMany({
		where: {
			published: true,
			datetime: { gt: windowStart, lte: now },
		},
		select: { section: true, slug: true },
		take: limit,
	})
}

/**
 * Invalidates every cache tag tied to a blog section so updated posts
 * surface immediately on list, archive, and feed endpoints.
 */
export function revalidatePostSection(section: Section): void {
	revalidateTag(feedTag(section), "max")
	revalidateTag(sectionTag(section), "max")
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
 * section aggregates (list, archive, feed, sitemap) never had this problem, but
 * not because they self-heal — they freeze at generation time too. They hold a
 * *listing*, so a missed bust omits a post rather than denying it, and the
 * section sweep in the same cron run covers them either way.
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
