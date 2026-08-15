import { describe, expect, it } from "vitest"
import { SECTIONS } from "@/lib/db/sections"
import { LEGACY_REDIRECTS, LEGACY_REWRITES } from "@/lib/routing/legacyRoutes"

// These rules are consumed by Next's routing layer, not by app code, so the
// matching itself belongs to path-to-regexp and is verified against a running
// build rather than here. What these tests pin is the rule SET: that no legacy
// URL shape silently disappears, and that every rule still points at a
// destination the app actually serves.

function findRedirect(source: string) {
	return LEGACY_REDIRECTS.find((rule) => rule.source === source)
}

// #region Redirects

describe("LEGACY_REDIRECTS", () => {
	it("redirects the old privacy policy URL", () => {
		expect(findRedirect("/privacy-policy")).toMatchObject({
			destination: "/privacy",
			permanent: true,
		})
	})

	it.each([
		["blog posts", "/blog/:section/:slug+"],
		["the archive", "/blog/:section/archive"],
		["search", "/blog/:section/search"],
		["the section root", "/blog/:section"],
		["the section feed", "/api/feed/:section"],
	])("keeps a section-parameterised rule for %s", (_label, destination) => {
		expect(
			LEGACY_REDIRECTS.some((rule) => rule.destination === destination)
		).toBe(true)
	})

	it("builds section rules from SECTIONS rather than hardcoding them", () => {
		// Adding a section must extend every legacy rule at once. If these sources
		// stop mentioning each section, a new section's legacy URLs 404 silently.
		const sectionRules = LEGACY_REDIRECTS.filter((rule) =>
			rule.source.includes(":section(")
		)

		expect(sectionRules.length).toBeGreaterThan(0)

		for (const rule of sectionRules) {
			for (const section of SECTIONS) {
				expect(rule.source).toContain(section)
			}
		}
	})

	it.each([
		"/feed",
		"/:alias(rss|rss\\.xml|feed\\.xml|atom\\.xml|index\\.xml)",
	])("points the sectionless feed URL %s at the default section", (source) => {
		// Pinned to `tech` deliberately: resolving this from `SECTIONS[0]` would
		// silently repoint every existing subscriber's feed if the array is ever
		// reordered.
		expect(findRedirect(source)?.destination).toBe("/api/feed/tech")
	})

	it("requires at least one slug segment on the blog rule", () => {
		// `:slug+`, not `:slug*` — with `*` the rule also matches `/tech/blog/`
		// and redirects it to a slugless `/blog/tech/`, which 404s.
		const rule = LEGACY_REDIRECTS.find((entry) =>
			entry.destination.startsWith("/blog/:section/:slug")
		)

		expect(rule?.source).toContain(":slug+")
	})

	it("marks every legacy redirect permanent", () => {
		// These carry the SEO signal of the pre-restructure URLs. A temporary
		// redirect would leave the old URL as the indexed one.
		for (const rule of LEGACY_REDIRECTS) {
			expect(rule).toMatchObject({ permanent: true })
		}
	})
})

// #endregion

// #region Rewrites

describe("LEGACY_REWRITES", () => {
	it("rewrites the pretty feed URL to the feed handler", () => {
		const rule = LEGACY_REWRITES.find((entry) =>
			entry.source.endsWith("/feed.xml")
		)

		expect(rule?.destination).toBe("/api/feed/:section")
	})

	it("rewrites the markdown export to its route handler", () => {
		const rule = LEGACY_REWRITES.find((entry) => entry.source.endsWith(".md"))

		expect(rule?.destination).toBe("/api/blog/:section/:slug/md")
	})

	it("constrains the markdown slug to the shape createSlug produces", () => {
		// The `.md` suffix is only unambiguous because a slug can't contain a dot.
		// A looser pattern would make `/blog/tech/some.name.md` split arbitrarily.
		const rule = LEGACY_REWRITES.find((entry) => entry.source.endsWith(".md"))

		expect(rule?.source).toContain(":slug([a-z0-9-]+)")
	})

	it("scopes every rewrite to a known section", () => {
		for (const rule of LEGACY_REWRITES) {
			for (const section of SECTIONS) {
				expect(rule.source).toContain(section)
			}
		}
	})
})

// #endregion
