import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The one relation the scheduled-content design rests on, and the one nothing
 * checked: `WINDOW_HOURS` in the cron route must stay above the widest gap two
 * consecutive runs can produce.
 *
 * It lived as prose in two files. A schedule edit (`0 0 * * *` → `0 1 * * *`)
 * landed during the review that flagged this with nothing to check the relation
 * — harmless, because both are daily, but it demonstrates the path is
 * unguarded. Set the schedule to twice daily and the window becomes
 * over-generous; set it to every other day and scheduled posts start falling
 * out of every window and stranding.
 *
 * Both values are read from their real sources — `vercel.json` parsed, and the
 * constant scraped from the route — rather than restated here, so this fails on
 * a real edit rather than on a copy of one.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..")
const CRON_PATH = "/api/cron/revalidate-scheduled"

interface VercelConfig {
	crons?: { path: string; schedule: string }[]
}

function vercelConfig(): VercelConfig {
	return JSON.parse(
		readFileSync(join(REPO_ROOT, "vercel.json"), "utf8")
	) as VercelConfig
}

function scheduleFor(path: string): string {
	const entry = vercelConfig().crons?.find((cron) => cron.path === path)

	if (entry === undefined) {
		throw new Error(`No cron entry for ${path} in vercel.json`)
	}

	return entry.schedule
}

/**
 * Hours between consecutive firings of a cron expression.
 *
 * Deliberately narrow: it understands the daily and every-N-hours shapes this
 * project can actually use, and throws on anything else rather than guessing.
 * Hobby rejects any expression firing more than once a day, so a sub-daily
 * cadence is spelled as N separate daily entries at fixed hours — which is why
 * the multi-entry case is handled by counting entries, below.
 */
function intervalHours(schedule: string): number {
	const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.split(" ")

	if (dayOfMonth !== "*" || month !== "*" || dayOfWeek !== "*") {
		throw new Error(
			`Unsupported cron schedule "${schedule}" — this test only understands daily and every-N-hours forms. Update it alongside the schedule.`
		)
	}

	if (!/^\d+$/.test(minute)) {
		throw new Error(`Unsupported cron minute field in "${schedule}"`)
	}

	if (/^\d+$/.test(hour)) {
		return 24
	}

	const everyN = /^\*\/(\d+)$/.exec(hour)

	if (everyN) {
		return Number(everyN[1])
	}

	throw new Error(`Unsupported cron hour field in "${schedule}"`)
}

/**
 * `WINDOW_HOURS` as the route actually declares it. Scraped rather than
 * imported: a `route.ts` may only export handlers and segment config, so the
 * constant cannot be exported for a test to read.
 */
function windowHours(): number {
	const source = readFileSync(
		join(__dirname, "revalidate-scheduled", "route.ts"),
		"utf8"
	)
	const match = /const WINDOW_HOURS = (\d+)/.exec(source)

	if (match === null) {
		throw new Error("Could not find WINDOW_HOURS in the cron route")
	}

	return Number(match[1])
}

/** Daily entries for one path; N of them buy an every-24/N-hours cadence. */
function entryCount(path: string): number {
	return (vercelConfig().crons ?? []).filter((cron) => cron.path === path)
		.length
}

describe("scheduled-content window invariant", () => {
	it("finds the cron entry it is asserting about", () => {
		// Without this, a renamed path turns every assertion below into a throw
		// that reads like a broken test rather than a broken schedule.
		expect(entryCount(CRON_PATH)).toBeGreaterThan(0)
	})

	it("looks back further than two consecutive runs can span", () => {
		// The asymmetry the whole design rests on: overlap costs one redundant
		// revalidation, a gap silently strands a post until the next real
		// mutation. `2 × interval` absorbs one missed run (Vercel documents cron
		// delivery as best effort, with no retry), +1 covers Hobby's ±59 minutes
		// of scheduling jitter, +1 covers the hour a DST transition takes off the
		// post window, which is a local wall-clock string.
		const effectiveInterval =
			intervalHours(scheduleFor(CRON_PATH)) / entryCount(CRON_PATH)

		expect(windowHours()).toBeGreaterThanOrEqual(2 * effectiveInterval + 2)
	})

	it("does not look back so far that the window is unbounded", () => {
		// The other direction is not a correctness bug but it is a cost one: every
		// extra hour of window is another slice of already-current content
		// re-busted on every run. Four intervals is generous and still finite.
		const effectiveInterval =
			intervalHours(scheduleFor(CRON_PATH)) / entryCount(CRON_PATH)

		expect(windowHours()).toBeLessThanOrEqual(4 * effectiveInterval)
	})

	it("keeps the schedule in a shape the invariant can be computed from", () => {
		// If someone writes a schedule this test can't parse, that must fail here
		// rather than silently skipping the relation it exists to guard.
		expect(() => intervalHours(scheduleFor(CRON_PATH))).not.toThrow()
	})
})
