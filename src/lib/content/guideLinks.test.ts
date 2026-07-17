import { describe, expect, it } from "vitest"
import {
	guideToLinkItem,
	overviewToLinkItems,
	topicToLinkItem,
} from "@/lib/content/guideLinks"
import { makeGuideListItem, makeGuideTopicSummary } from "@/test/fixtures"
import type { GuideTopicWithGuides } from "@/lib/db/guides"

function makeTopicWithGuides(
	guideCount: number,
	overrides: Partial<GuideTopicWithGuides> = {}
): GuideTopicWithGuides {
	return {
		...makeGuideTopicSummary(),
		guides: Array.from({ length: guideCount }, (_, index) =>
			makeGuideListItem({ id: index + 1, slug: `guide-${index + 1}` })
		),
		...overrides,
	}
}

// #region guideToLinkItem

describe("guideToLinkItem", () => {
	it("maps a guide to its slug, title, and description", () => {
		const item = guideToLinkItem(makeGuideListItem())

		expect(item.slug).toBe("how-to-keep-a-decision-journal")
		expect(item.title).toBe("How to keep a decision journal")
		expect(item.description).toBe(
			"What to write down before an outcome exists, and why."
		)
	})

	it("uses reading time as the meta hint", () => {
		const item = guideToLinkItem(makeGuideListItem())

		expect(item.meta).toBe("6 min read")
	})

	it("omits the meta hint when there is no reading time", () => {
		const item = guideToLinkItem(makeGuideListItem({ readingTime: null }))

		expect(item.meta).toBeUndefined()
	})
})

// #endregion

// #region topicToLinkItem

describe("topicToLinkItem", () => {
	it("uses the topic's shortDescription as the entry description", () => {
		const item = topicToLinkItem(makeTopicWithGuides(2))

		expect(item.description).toBe(
			"A method for judging your own calls honestly."
		)
	})

	it("links into the same flat namespace as a guide", () => {
		const item = topicToLinkItem(makeTopicWithGuides(2))

		expect(item.slug).toBe("making-better-decisions")
	})

	it("uses the guide count as the meta hint — the one signal it leads to a hub", () => {
		const item = topicToLinkItem(makeTopicWithGuides(3))

		expect(item.meta).toBe("3 guides")
	})

	it("singularizes a one-guide topic", () => {
		const item = topicToLinkItem(makeTopicWithGuides(1))

		expect(item.meta).toBe("1 guide")
	})

	it("omits the count for an empty topic rather than advertising `0 guides`", () => {
		const item = topicToLinkItem(makeTopicWithGuides(0))

		expect(item.meta).toBeUndefined()
	})
})

// #endregion

// #region overviewToLinkItems

describe("overviewToLinkItems", () => {
	it("lists topics before ungrouped guides", () => {
		const items = overviewToLinkItems({
			topics: [makeTopicWithGuides(1)],
			ungrouped: [makeGuideListItem({ slug: "standalone" })],
		})

		expect(items.map((item) => item.slug)).toEqual([
			"making-better-decisions",
			"standalone",
		])
	})

	it("returns an empty list for an empty overview", () => {
		expect(overviewToLinkItems({ topics: [], ungrouped: [] })).toEqual([])
	})

	it("preserves the order within each group", () => {
		const items = overviewToLinkItems({
			topics: [],
			ungrouped: [
				makeGuideListItem({ slug: "first" }),
				makeGuideListItem({ slug: "second" }),
			],
		})

		expect(items.map((item) => item.slug)).toEqual(["first", "second"])
	})
})

// #endregion
