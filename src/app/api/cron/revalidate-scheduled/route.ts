import { NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cronAuth"
import {
	findGuidesBecameLive,
	revalidateAllGuides,
	revalidateGuideDetails,
	revalidateGuides,
} from "@/lib/db/guides"
import {
	findPostsBecameLive,
	revalidateAllPosts,
	revalidatePostDetails,
	revalidatePostSection,
} from "@/lib/db/posts"
import { SECTIONS } from "@/lib/db/sections"
import { currentDatetimeString } from "@/lib/utils/format"
import { randomShortId } from "@/lib/utils/randomShortId"
import type { PostRef } from "@/lib/db/posts"
import type { NextRequest } from "next/server"

const LOG_TAG = "api:cron:revalidate-scheduled"

/**
 * How far back to look for posts that came due, in hours. Deliberately WIDER
 * than the cron interval in `vercel.json` (daily): a skipped or delayed run
 * would otherwise leave a post outside both windows, stranding it until the next
 * real mutation. Overlap costs one redundant revalidation; a gap loses a post
 * silently, so the asymmetry favours overlapping.
 *
 * Fifty hours, not twenty-four, because three effects stack. Hobby cron
 * scheduling is only accurate to ±59 minutes — `0 1 * * *` fires anywhere inside
 * the 01:00 hour — so consecutive runs can already land 24h59m apart with
 * nothing wrong. Vercel documents cron delivery as best effort, with no retry on
 * failure: a run can simply not happen. And the post half of the window is an
 * absolute offset flattened to a local wall-clock string (see `GET`), so a
 * spring-forward transition costs it one more hour. Double the interval to
 * absorb one missed run, add an hour for the jitter, add an hour for the DST
 * shift.
 *
 * That last hour is inert on Vercel, where the runtime is UTC and there is no
 * transition to hit. It is here because nothing in the repo pins `TZ`, so a
 * self-hosted deploy in a DST zone would otherwise get a 48h window — exactly
 * two intervals, jitter hour erased — twice a year.
 *
 * The overlap is bounded rather than free. Both queries return the rows that
 * came due, not a count, so a wider window returns more of them and each extra
 * row costs one `revalidateTag` on a detail entry that is already current. On
 * the common path (nothing came due) it costs nothing — an empty result either
 * way — and the ceiling is one extra day of scheduled content, re-busted once.
 *
 * Changing the cron interval means changing this too — keep it above the widest
 * gap two consecutive runs can produce, including a missed one.
 * `windowInvariant.test.ts` parses `vercel.json` and asserts the relation.
 */
const WINDOW_HOURS = 50

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000

/**
 * Most due rows either half will process individually before falling back to a
 * blanket bust.
 *
 * The per-row path costs one `revalidateTag` per due item, which is right for
 * the handful a normal day produces. A bulk import of backdated content
 * (`/admin/posts/bulk` exists) can land hundreds inside one window, and at that
 * size the targeted path is both slower and pointless — busting the shared
 * `post-pages` / `guide-pages` tag once covers all of them.
 *
 * So this is a switch, not a limit: nothing is dropped when it trips, the run
 * just takes the blunter path and says so in the log. Queries fetch `CAP + 1`
 * rows, which is the cheapest way to distinguish "exactly at the cap" from
 * "over it" without a second count.
 */
const DUE_ROW_CAP = 200

/**
 * The failed-run response. A 500 is what marks the run failed in Vercel's cron
 * log; `requestId` is what ties this response back to the `due-content check
 * failed` line that named which half broke.
 */
function failed(requestId: string): NextResponse {
	return NextResponse.json(
		{ error: "Check failed", requestId },
		{ status: 500 }
	)
}

/**
 * Surfaces scheduled posts and guides whose publication time has passed.
 *
 * Every other path that changes the live content set is a mutation, and
 * mutations revalidate their tags directly. Scheduled content going live is the
 * exception: nothing runs at that moment, so nothing busts the caches the feed,
 * archive, and sitemap are built from. This route is what runs at that moment.
 *
 * It replaces the `revalidate = 3600` those three routes used to carry. That
 * backstop regenerated all three every hour whether or not anything had changed
 * — and with crawlers and feed readers polling continuously, "whether or not"
 * was always "yes". Checking first turns ~72 daily regenerations into two
 * due-content queries per day plus a bust on the rare day that needs one.
 *
 * Posts and guides are both checked because the sitemap spans both, and their
 * publication times are stored differently: a post's `datetime` is a
 * `yyyy-MM-dd-HHmm` string, a guide's `publishedAt` is a real `DateTime`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
	const unauthorized = requireCronAuth(request, LOG_TAG)

	if (unauthorized) {
		return unauthorized
	}

	// ONE clock read for the whole run. This used to be three — `Date.now()` for
	// the lower bound, a bare `currentDatetimeString()` for the upper, and a fresh
	// `new Date()` for the guide query — so the post and guide windows closed at
	// different instants and the two halves of a single run disagreed about "now".
	// The guide tests assert that parity in prose; deriving everything from `at`
	// is what makes it true.
	//
	// `currentDatetimeString` renders LOCAL wall-clock, which is the right frame:
	// `Post.datetime` is an authored wall-clock string, so the compare has to
	// happen in that frame. The cost is that a DST transition shortens the post
	// window by an hour while the guide window (absolute `Date`s) is unaffected —
	// which is the hour `WINDOW_HOURS` buys back.
	const at = new Date()
	const windowStartDate = new Date(
		at.getTime() - WINDOW_HOURS * MILLISECONDS_PER_HOUR
	)
	const now = currentDatetimeString(at)
	const windowStart = currentDatetimeString(windowStartDate)

	// `allSettled`, not `all`: the two checks are independent, and under `all` a
	// transient failure on either side discarded a perfectly good result from the
	// other and revalidated nothing. Partial work beats no work when the failure
	// mode is "scheduled content stays invisible". The run is still reported as
	// failed below, so a persistent fault is not masked by the half that worked.
	const [postResult, guideResult] = await Promise.allSettled([
		findPostsBecameLive(windowStart, now, DUE_ROW_CAP + 1),
		findGuidesBecameLive(windowStartDate, at, DUE_ROW_CAP + 1),
	])

	const duePosts: PostRef[] =
		postResult.status === "fulfilled" ? postResult.value : []
	const dueGuides: string[] =
		guideResult.status === "fulfilled" ? guideResult.value : []

	const postsFailed = postResult.status === "rejected"
	const guidesFailed = guideResult.status === "rejected"
	const hasFailure = postsFailed || guidesFailed

	// Shares `respondInternalError`'s contract — one id in the log line, the same
	// id in the response body — without calling it. That helper logs `(tag, {
	// requestId }, error)` and nothing more, and the window bounds are the whole
	// of what makes a failed run reconstructable afterwards. Matching the shape
	// rather than the call site is the reconciliation.
	const failureId = hasFailure ? randomShortId() : null

	if (failureId !== null) {
		// Names WHICH half failed and carries both window bounds. Under `all` this
		// line could say neither: one rejection surfaced as one opaque error, and
		// `now` was never logged at all, so a window that looked wrong in hindsight
		// could not be reconstructed from the log.
		// eslint-disable-next-line no-console
		console.error(`[${LOG_TAG}] due-content check failed`, {
			requestId: failureId,
			windowStart,
			now,
			postsFailed,
			guidesFailed,
			postsError: postsFailed ? postResult.reason : undefined,
			guidesError: guidesFailed ? guideResult.reason : undefined,
		})
	}

	if (duePosts.length === 0 && dueGuides.length === 0) {
		if (failureId !== null) {
			// Nothing to revalidate AND a broken check. The 500 is what marks the
			// run failed in Vercel's cron log; without it a database outage looks
			// exactly like the (very common) quiet day.
			return failed(failureId)
		}

		// The common case, by a wide margin — but still logged. Silence on the
		// happy path would make "nothing came due" indistinguishable from "this
		// cron stopped running", and a cron that stops running strands every
		// scheduled post indefinitely now that the `revalidate` backstop is
		// gone. Mirrors the positive heartbeat in the ping route, for the same
		// "alert if no success in N hours" grep.
		// eslint-disable-next-line no-console
		console.info(`[${LOG_TAG}] nothing due`, { windowStart, now })

		return NextResponse.json({
			ok: true,
			duePosts: 0,
			dueGuides: 0,
			revalidated: false,
		})
	}

	const postsOverflowed = duePosts.length > DUE_ROW_CAP
	const guidesOverflowed = dueGuides.length > DUE_ROW_CAP

	// Every section is busted regardless of which one the due post belongs to:
	// the sitemap and the `posts` aggregate span sections, and the extra work
	// lands on an hour that already had a real change.
	if (duePosts.length > 0) {
		if (postsOverflowed) {
			// Past the cap the per-row path is worse on both axes, so bust the
			// shared `post-pages` tag once instead. Strictly more thorough than the
			// targeted path — it covers rows this query never returned — which is
			// what makes the cap safe to enforce with a `take`.
			revalidateAllPosts()
		} else {
			for (const section of SECTIONS) {
				revalidatePostSection(section)
			}

			// Targeted, unlike the section sweep above: only the posts that came due
			// get their detail entries regenerated. Without this the aggregates would
			// list a post whose own page and `.md` still served a pinned 404.
			//
			// A gap wider than `WINDOW_HOURS` strands a post outside every window, and
			// the two halves then recover unevenly: the next admin save busts the
			// section aggregates for ALL posts, but `revalidatePost` busts only the
			// saved post's own detail tag. The stranded post ends up listed everywhere
			// and 404ing on its own URL — the exact state this call exists to prevent.
			// `revalidateAllPosts` (the `post-pages` tag) is the only thing that heals
			// it; reach for that if a run is ever confirmed missed.
			revalidatePostDetails(duePosts)
		}
	}

	if (dueGuides.length > 0) {
		if (guidesOverflowed) {
			revalidateAllGuides()
		} else {
			revalidateGuides()
			revalidateGuideDetails(dueGuides)
		}
	}

	// The slugs, not just the counts: this run is the only thing standing between
	// scheduled content and a pinned 404 on its detail URL, so a failure to
	// surface one needs to be traceable to the exact post or guide afterwards.
	// Slug lists are omitted on the overflow path — hundreds of them would bury
	// the line, and the blanket bust makes "which ones" moot.
	// eslint-disable-next-line no-console
	console.info(`[${LOG_TAG}] revalidated for due content`, {
		duePosts: duePosts.length,
		duePostSlugs: postsOverflowed
			? "over cap — blanket bust"
			: duePosts.map((post) => `${post.section}/${post.slug}`),
		dueGuides: dueGuides.length,
		dueGuideSlugs: guidesOverflowed ? "over cap — blanket bust" : dueGuides,
		// Carried even on the success path: without them a half that FAILED is
		// indistinguishable here from a half that found nothing, since both report
		// a count of 0.
		postsFailed,
		guidesFailed,
		windowStart,
		now,
	})

	if (failureId !== null) {
		// One half revalidated, the other never ran. The work above is kept — it
		// is real and correct — but the run still reports failed so the outage is
		// visible rather than hidden behind a partial success.
		return failed(failureId)
	}

	return NextResponse.json({
		ok: true,
		duePosts: duePosts.length,
		dueGuides: dueGuides.length,
		revalidated: true,
	})
}
