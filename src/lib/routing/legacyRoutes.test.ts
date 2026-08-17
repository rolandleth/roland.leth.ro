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

// The two pagination rules pin `:section` to the known set rather than leaving
// it bare, so their sources are built the same way the module builds them.
const SECTION_PARAM = `:section(${SECTIONS.join("|")})`
const PAGE_QUERY_SOURCE = `/blog/${SECTION_PARAM}`
const PAGE_ONE_SOURCE = `/blog/${SECTION_PARAM}/p/1`

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
		const rule = findRedirect(PAGE_QUERY_SOURCE)

		expect(rule).toMatchObject({
			destination: "/blog/:section/p/:page",
			permanent: true,
		})
		expect(rule?.has).toEqual([
			{ type: "query", key: "page", value: "(?<page>[1-9]\\d*)" },
		])
	})

	it("captures the page number as a named group", () => {
		// The destination interpolates `:page`, which only resolves if `has`
		// exposes it as a named capture. A bare `.*` value would match but
		// leave `:page` undefined in the destination.
		const rule = findRedirect(PAGE_QUERY_SOURCE)

		expect(rule?.has?.[0]).toHaveProperty("value", "(?<page>[1-9]\\d*)")
		expect(rule?.destination).toContain(":page")
	})

	it.each([
		["2", true],
		["12", true],
		["1", true],
		["abc", false],
		["2abc", false],
		// The reason the pattern is `[1-9]\d*` and not `\d+`. The destination
		// route rejects any segment that isn't exactly its own parsed form, so
		// these matched, redirected, and 404'd — a rule whose entire job is
		// carrying SEO signal forward, delivering it to a dead end. Unmatched,
		// they fall through to `/blog/:section` and render page 1.
		["0", false],
		["02", false],
		["007", false],
	])("matches page value %s: %s", (value, expected) => {
		const rule = findRedirect(PAGE_QUERY_SOURCE)
		const pattern = new RegExp(`^${rule?.has?.[0]?.value}$`)

		expect(pattern.test(value)).toBe(expected)
	})

	it.each([PAGE_QUERY_SOURCE, PAGE_ONE_SOURCE])(
		"pins the section in %s rather than leaving it bare",
		(source) => {
			// Bare, `/blog/bogus?page=2` redirected to `/blog/bogus/p/2` and 404'd
			// there — a redirect into a dead end where a direct 404 was available.
			// Every other rule in the file pins the section; these two didn't.
			expect(findRedirect(source)).toBeDefined()

			for (const section of SECTIONS) {
				expect(source).toContain(section)
			}
		}
	)

	it("collapses /p/1 onto the bare section path", () => {
		// One page, one URL. `blogPagePath` keeps internal links off `/p/1`;
		// this catches anything hand-typed or previously indexed.
		expect(findRedirect(PAGE_ONE_SOURCE)).toMatchObject({
			destination: "/blog/:section",
			permanent: true,
		})
	})

	it("orders the ?page= rule before the /p/1 collapse", () => {
		// `/blog/tech?page=1` must reach the query rule first and land on
		// `/p/1`, which the next rule then collapses to `/blog/tech`. Reversed,
		// the query rule would still fire but the ordering intent is lost.
		const queryRuleIndex = LEGACY_REDIRECTS.findIndex(
			(rule) => rule.source === PAGE_QUERY_SOURCE
		)
		const collapseIndex = LEGACY_REDIRECTS.findIndex(
			(rule) => rule.source === PAGE_ONE_SOURCE
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
