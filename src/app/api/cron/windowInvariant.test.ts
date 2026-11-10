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
 * unguarded. Set the schedule to every 30 minutes and the window becomes
 * over-generous; set it to every two hours and scheduled posts start falling
 * out of every window and stranding.
 *
 * Both values are read from their real sources — `vercel.json` parsed, and the
 * constant scraped from the route — rather than restated here, so this fails on
 * a real edit rather than on a copy of one.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..")
const SCHEDULED_CONTENT_PATH = "/api/cron/revalidate-scheduled"

/**
 * The latest a run can start after its scheduled time. Vercel Schedules always
 * use a 15-minute window on Hobby, and allow 1 to 15 minutes on Pro and
 * Enterprise, so 15 covers every plan.
 */
const JITTER_HOURS = 0.25

/**
 * What a spring-forward transition takes off the post window, which is a local
 * wall-clock string. Inert on Vercel, which runs UTC; it covers a self-hosted
 * deploy in a DST zone.
 */
const DST_SHIFT_HOURS = 1

interface Schedule {
	path: string
	schedule: string
	requestMethod?: string
}

interface VercelConfig {
	crons?: unknown
	schedules?: Record<string, Schedule>
}

function vercelConfig(): VercelConfig {
	return JSON.parse(
		readFileSync(join(REPO_ROOT, "vercel.json"), "utf8")
	) as VercelConfig
}

function allSchedules(): Schedule[] {
	return Object.values(vercelConfig().schedules ?? {})
}

function schedulesFor(path: string): Schedule[] {
	return allSchedules().filter((entry) => entry.path === path)
}

function scheduleFor(path: string): string {
	const [entry, ...rest] = schedulesFor(path)

	if (entry === undefined || rest.length > 0) {
		throw new Error(`Expected exactly one schedule for ${path} in vercel.json`)
	}

	return entry.schedule
}

/**
 * Hours between consecutive firings of a cron expression.
 *
 * Deliberately narrow: it understands the hourly, every-N-hours and daily shapes
 * this project can use, and throws on anything else rather than guessing. A
 * sub-hourly schedule (`*\/15 * * * *`) throws on purpose: the window would then
 * need a fractional interval, and the bounds below should be re-read with it.
 */
function intervalHours(schedule: string): number {
	const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.split(" ")

	if (dayOfMonth !== "*" || month !== "*" || dayOfWeek !== "*") {
		throw new Error(
			`Unsupported cron schedule "${schedule}" — this test only understands hourly, every-N-hours and daily forms. Update it alongside the schedule.`
		)
	}

	if (!/^\d+$/.test(minute)) {
		throw new Error(`Unsupported cron minute field in "${schedule}"`)
	}

	if (hour === "*") {
		return 1
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

describe("scheduled-content window invariant", () => {
	it("finds exactly one schedule for the route", () => {
		// Without this, a renamed path turns every assertion below into a throw
		// that reads like a broken test rather than a broken schedule. A second
		// entry for the same path would add runs this test never looks at.
		expect(schedulesFor(SCHEDULED_CONTENT_PATH)).toHaveLength(1)
	})

	it("looks back further than two consecutive runs can span", () => {
		// The asymmetry the whole design rests on: overlap costs a redundant
		// revalidation, a gap silently strands a post until the next real
		// mutation. `2 × interval` absorbs one missed or late run (Vercel does not
		// retry a failed run), plus the jitter on the run's start, plus the hour a
		// DST transition takes off the post window, which is a local wall-clock
		// string.
		const interval = intervalHours(scheduleFor(SCHEDULED_CONTENT_PATH))

		expect(windowHours()).toBeGreaterThanOrEqual(
			2 * interval + JITTER_HOURS + DST_SHIFT_HOURS
		)
	})

	it("does not look back so far that the window is unbounded", () => {
		// The other direction is not a correctness bug but it is a cost one: every
		// run whose window still holds a due post busts the section aggregates
		// again. Four intervals is generous and still finite.
		const interval = intervalHours(scheduleFor(SCHEDULED_CONTENT_PATH))

		expect(windowHours()).toBeLessThanOrEqual(4 * interval)
	})

	it("keeps the schedule in a shape the invariant can be computed from", () => {
		// If someone writes a schedule this test can't parse, that must fail here
		// rather than silently skipping the relation it exists to guard.
		expect(() =>
			intervalHours(scheduleFor(SCHEDULED_CONTENT_PATH))
		).not.toThrow()
	})
})

describe("vercel.json schedules", () => {
	it("has no Cron Jobs left beside the schedules", () => {
		// A Cron Job and a schedule on the same path both fire, and the invariant
		// above reads only `schedules`, so a stray `crons` entry would run
		// unchecked.
		expect(vercelConfig().crons).toBeUndefined()
	})

	it("calls every route with GET", () => {
		// Path schedules send POST unless told otherwise, and the cron routes
		// export only `GET`: a missing `requestMethod` 405s every run.
		const schedules = allSchedules()

		expect(schedules.length).toBeGreaterThan(0)

		for (const entry of schedules) {
			expect(entry.requestMethod, entry.path).toBe("GET")
		}
	})
})
