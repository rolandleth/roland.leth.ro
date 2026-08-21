import { describe, expect, it } from "vitest"
import {
	FEED_AUTHOR_NAME,
	feedLinkForSection,
	feedPathForSection,
	feedTag,
	feedTitleForSection,
} from "./feed"

describe("feed identity helpers", () => {
	it("builds the canonical content-shaped path per section", () => {
		expect(feedPathForSection("tech")).toBe("/blog/tech/feed.xml")
		expect(feedPathForSection("life")).toBe("/blog/life/feed.xml")
	})

	it("builds a titled name that matches the Atom document's <title>", () => {
		// This exact string is emitted as both the feed's `<title>` and the
		// autodiscovery `<link title>`; they must stay in lockstep, which is the
		// reason both derive from this one helper.
		expect(feedTitleForSection("tech")).toBe(`${FEED_AUTHOR_NAME} — Tech blog`)
		expect(feedTitleForSection("life")).toBe(`${FEED_AUTHOR_NAME} — Life blog`)
	})

	it("pairs path and title into a single descriptor", () => {
		expect(feedLinkForSection("tech")).toEqual({
			path: "/blog/tech/feed.xml",
			title: "Roland Leth — Tech blog",
		})
	})

	it("builds the section-scoped feed cache tag", () => {
		// Set on the feed route's cache entry and busted from
		// revalidatePostSection in posts.ts — two files that have to agree on
		// the exact string, which is the whole reason this is a shared function
		// rather than a literal in each.
		expect(feedTag("tech")).toBe("feed-tech")
		expect(feedTag("life")).toBe("feed-life")
	})
})
