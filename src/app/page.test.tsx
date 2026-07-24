import { describe, expect, it } from "vitest"
import { metadata } from "./page"

describe("landing page metadata", () => {
	it("advertises the tech feed (titled) explicitly rather than by inheritance", () => {
		// The landing page is the most common autodiscovery entry point, so it
		// declares the feed itself instead of relying on the layout default that
		// Next's replace-not-merge would drop the moment the page sets alternates.
		expect(metadata.alternates?.types?.["application/atom+xml"]).toEqual([
			{ url: "/blog/tech/feed.xml", title: "Roland Leth — Tech blog" },
		])
	})
})
