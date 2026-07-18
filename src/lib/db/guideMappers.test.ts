import { describe, expect, it } from "vitest"
import {
	compareGuides,
	guideOrder,
	isScheduledGuide,
	resolvePublishedAt,
} from "@/lib/db/guideMappers"

const NOW = new Date("2026-07-17T09:00:00.000Z")
const EARLIER = new Date("2026-01-01T00:00:00.000Z")
const LATER = new Date("2026-12-31T00:00:00.000Z")

// #region isScheduledGuide

describe("isScheduledGuide", () => {
	it("reports a future publish date as scheduled", () => {
		expect(isScheduledGuide(LATER, NOW)).toBe(true)
	})

	it("reports a past publish date as live", () => {
		expect(isScheduledGuide(EARLIER, NOW)).toBe(false)
	})

	// Boundary: a guide dated exactly now is live, not pending.
	it("treats a publish date equal to now as live", () => {
		expect(isScheduledGuide(new Date(NOW), NOW)).toBe(false)
	})

	it("treats one millisecond in the future as scheduled", () => {
		expect(isScheduledGuide(new Date(NOW.getTime() + 1), NOW)).toBe(true)
	})

	// The safe reading of a missing date is live — treating it as scheduled
	// would silently hide a page that's meant to be up.
	it("never reports a null publish date as scheduled", () => {
		expect(isScheduledGuide(null, NOW)).toBe(false)
	})

	// `unstable_cache` round-trips through JSON, so the type lies at runtime.
	it("handles a date handed back from the cache as an ISO string", () => {
		expect(isScheduledGuide(LATER.toISOString() as unknown as Date, NOW)).toBe(
			true
		)
		expect(
			isScheduledGuide(EARLIER.toISOString() as unknown as Date, NOW)
		).toBe(false)
	})
})

// #endregion

// #region resolvePublishedAt

describe("resolvePublishedAt", () => {
	it("stamps `now` on a first publish", () => {
		expect(resolvePublishedAt(null, true, NOW)).toBe(NOW)
	})

	it("leaves an existing publish date untouched when republishing", () => {
		expect(resolvePublishedAt(EARLIER, true, NOW)).toBeUndefined()
	})

	it("does not stamp a date when publishing is not requested", () => {
		expect(resolvePublishedAt(null, false, NOW)).toBeUndefined()
	})

	it("does not stamp a date when the publish flag is absent from the payload", () => {
		expect(resolvePublishedAt(null, undefined, NOW)).toBeUndefined()
	})

	it("does not clear the date when unpublishing", () => {
		expect(resolvePublishedAt(EARLIER, false, NOW)).toBeUndefined()
	})

	// The regression this guards: an unpublish → republish cycle (staging a fix)
	// must not reset `datePublished` and make an indexed guide look new.
	it("keeps the original date across an unpublish/republish cycle", () => {
		const afterUnpublish = resolvePublishedAt(EARLIER, false, NOW)
		const afterRepublish = resolvePublishedAt(EARLIER, true, NOW)

		expect(afterUnpublish).toBeUndefined()
		expect(afterRepublish).toBeUndefined()
	})
})

// #endregion

// #region guideOrder

describe("guideOrder", () => {
	it("orders by sortOrder then title so the order is total", () => {
		expect(guideOrder).toEqual([{ sortOrder: "asc" }, { title: "asc" }])
	})
})

// #endregion

// #region compareGuides

describe("compareGuides", () => {
	it("orders by sortOrder ascending", () => {
		expect(
			compareGuides({ sortOrder: 2, title: "a" }, { sortOrder: 1, title: "b" })
		).toBeGreaterThan(0)
	})

	it("breaks sortOrder ties by title, ascending", () => {
		expect(
			compareGuides(
				{ sortOrder: 0, title: "Alpha" },
				{ sortOrder: 0, title: "Beta" }
			)
		).toBeLessThan(0)
	})

	// The comparator must encode the same fields and direction as `guideOrder`, or
	// the in-memory ungrouped list orders differently from every DB-ordered list.
	it("sorts a list the same way guideOrder's fields describe", () => {
		const rows = [
			{ sortOrder: 1, title: "Zebra" },
			{ sortOrder: 0, title: "Beta" },
			{ sortOrder: 0, title: "Alpha" },
			{ sortOrder: 2, title: "Alpha" },
		]

		expect([...rows].sort(compareGuides)).toEqual([
			{ sortOrder: 0, title: "Alpha" },
			{ sortOrder: 0, title: "Beta" },
			{ sortOrder: 1, title: "Zebra" },
			{ sortOrder: 2, title: "Alpha" },
		])
		expect(guideOrder).toEqual([{ sortOrder: "asc" }, { title: "asc" }])
	})
})

// #endregion
