import { NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cronAuth"
import { countGuidesBecameLive, revalidateGuides } from "@/lib/db/guides"
import { countPostsBecameLive, revalidatePostSection } from "@/lib/db/posts"
import { SECTIONS } from "@/lib/db/sections"
import { currentDatetimeString } from "@/lib/utils/format"
import type { NextRequest } from "next/server"

const LOG_TAG = "api:cron:revalidate-scheduled"

/**
 * How far back to look for posts that came due, in hours. Deliberately WIDER
 * than the cron interval in `vercel.json` (hourly): a skipped or delayed run
 * would otherwise leave a post outside both windows, stranding it until the
 * next real mutation. Overlap costs one redundant revalidation; a gap loses a
 * post silently, so the asymmetry favours overlapping.
 *
 * Raising the cron interval means raising this too — keep it at roughly double.
 */
const WINDOW_HOURS = 2

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000

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
 * was always "yes". Checking first turns ~72 daily regenerations into two count
 * queries per hour plus a bust on the rare hour that needs one.
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

	const windowStartDate = new Date(
		Date.now() - WINDOW_HOURS * MILLISECONDS_PER_HOUR
	)
	const now = currentDatetimeString()
	const windowStart = currentDatetimeString(windowStartDate)

	let duePosts: number
	let dueGuides: number

	try {
		;[duePosts, dueGuides] = await Promise.all([
			countPostsBecameLive(windowStart, now),
			countGuidesBecameLive(windowStartDate, new Date()),
		])
	} catch (error) {
		// A failed check means scheduled content stops surfacing, and nothing
		// else in the system would notice. Surface it as a 500 so Vercel marks
		// the cron run as failed rather than logging a silent success.
		// eslint-disable-next-line no-console
		console.error(`[${LOG_TAG}] due-content check failed`, {
			windowStart,
			error,
		})

		return NextResponse.json({ error: "Check failed" }, { status: 500 })
	}

	if (duePosts === 0 && dueGuides === 0) {
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
			duePosts,
			dueGuides,
			revalidated: false,
		})
	}

	// Every section is busted regardless of which one the due post belongs to:
	// the sitemap and the `posts` aggregate span sections, and the extra work
	// lands on an hour that already had a real change.
	if (duePosts > 0) {
		for (const section of SECTIONS) {
			revalidatePostSection(section)
		}
	}

	if (dueGuides > 0) {
		revalidateGuides()
	}

	// eslint-disable-next-line no-console
	console.info(`[${LOG_TAG}] revalidated for due content`, {
		duePosts,
		dueGuides,
		windowStart,
		now,
	})

	return NextResponse.json({ ok: true, duePosts, dueGuides, revalidated: true })
}
