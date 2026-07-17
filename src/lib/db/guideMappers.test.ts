import { describe, expect, it } from "vitest"
import { guideOrder, resolvePublishedAt } from "@/lib/db/guideMappers"

const NOW = new Date("2026-07-17T09:00:00.000Z")
const EARLIER = new Date("2026-01-01T00:00:00.000Z")

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
