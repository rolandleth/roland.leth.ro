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

	it("redirects legacy ?page=N to the path form", () => {
		// Page 1 stopped reading `searchParams` so the route could prerender;
		// without this, every indexed or bookmarked `?page=` URL renders page 1
		// silently instead of the page that was linked.
		const rule = findRedirect("/blog/:section")

		expect(rule).toMatchObject({
			destination: "/blog/:section/p/:page",
			permanent: true,
		})
		expect(rule?.has).toEqual([
			{ type: "query", key: "page", value: "(?<page>\\d+)" },
		])
	})

	it("captures the page number as a named group", () => {
		// The destination interpolates `:page`, which only resolves if `has`
		// exposes it as a named capture. A bare `.*` value would match but
		// leave `:page` undefined in the destination.
		const rule = findRedirect("/blog/:section")

		expect(rule?.has?.[0]).toHaveProperty("value", "(?<page>\\d+)")
		expect(rule?.destination).toContain(":page")
	})

	it("only captures numeric page values", () => {
		// `?page=abc` must not redirect to `/p/abc`, which would 404 rather
		// than falling through to page 1 as it does today.
		const rule = findRedirect("/blog/:section")
		const pattern = new RegExp(`^${rule?.has?.[0]?.value}$`)

		expect(pattern.test("2")).toBe(true)
		expect(pattern.test("abc")).toBe(false)
		expect(pattern.test("2abc")).toBe(false)
	})

	it("collapses /p/1 onto the bare section path", () => {
		// One page, one URL. `blogPagePath` keeps internal links off `/p/1`;
		// this catches anything hand-typed or previously indexed.
		expect(findRedirect("/blog/:section/p/1")).toMatchObject({
			destination: "/blog/:section",
			permanent: true,
		})
	})

	it("orders the ?page= rule before the /p/1 collapse", () => {
		// `/blog/tech?page=1` must reach the query rule first and land on
		// `/p/1`, which the next rule then collapses to `/blog/tech`. Reversed,
		// the query rule would still fire but the ordering intent is lost.
		const queryRuleIndex = LEGACY_REDIRECTS.findIndex(
			(rule) => rule.source === "/blog/:section"
		)
		const collapseIndex = LEGACY_REDIRECTS.findIndex(
			(rule) => rule.source === "/blog/:section/p/1"
		)

		expect(queryRuleIndex).toBeLessThan(collapseIndex)
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
