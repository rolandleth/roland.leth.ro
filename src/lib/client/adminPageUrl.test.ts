import { describe, expect, it } from "vitest"
import { buildAdminPageUrl, parseTab } from "@/lib/client/adminPageUrl"

describe("parseTab", () => {
	it("returns 'posts' for undefined", () => {
		expect(parseTab(undefined)).toBe("posts")
	})

	it("returns 'posts' for an unknown value", () => {
		expect(parseTab("garbage")).toBe("posts")
	})

	it("returns 'posts' when explicitly given 'posts'", () => {
		expect(parseTab("posts")).toBe("posts")
	})

	it("returns 'projects' when given 'projects'", () => {
		expect(parseTab("projects")).toBe("projects")
	})

	it("returns 'guides' when given 'guides'", () => {
		expect(parseTab("guides")).toBe("guides")
	})

	it("rejects mixed-case (strict allowlist)", () => {
		// Pin behaviour: a future caller flipping casing wouldn't silently
		// fall through to 'posts' and look like a typo got accepted.
		expect(parseTab("Projects")).toBe("posts")
	})
})

describe("buildAdminPageUrl", () => {
	it("returns the bare /admin for the default tab with no query and page 1", () => {
		expect(buildAdminPageUrl({ tab: "posts", query: "", page: 1 })).toBe(
			"/admin"
		)
	})

	it("includes ?tab=projects for the projects tab", () => {
		expect(buildAdminPageUrl({ tab: "projects", query: "", page: 1 })).toBe(
			"/admin?tab=projects"
		)
	})

	it("includes ?tab=guides for the guides tab", () => {
		expect(buildAdminPageUrl({ tab: "guides", query: "", page: 1 })).toBe(
			"/admin?tab=guides"
		)
	})

	// `AdminSearch` builds its URLs through here now; it used to hand-roll a
	// posts/projects ternary that silently pointed a guides search at projects.
	it("keeps the tab when a query is set on a non-default tab", () => {
		expect(
			buildAdminPageUrl({ tab: "guides", query: "journal", page: 1 })
		).toBe("/admin?tab=guides&q=journal")
	})

	it("includes ?q=foo when a query is set", () => {
		expect(buildAdminPageUrl({ tab: "posts", query: "foo", page: 1 })).toBe(
			"/admin?q=foo"
		)
	})

	it("includes ?page=N for pages > 1", () => {
		expect(buildAdminPageUrl({ tab: "posts", query: "", page: 3 })).toBe(
			"/admin?page=3"
		)
	})

	it("composes tab + query + page in URL-encoded form", () => {
		// Ordering follows URLSearchParams insertion: tab, q, page.
		expect(
			buildAdminPageUrl({ tab: "projects", query: "foo bar", page: 2 })
		).toBe("/admin?tab=projects&q=foo+bar&page=2")
	})

	it("URL-encodes special characters in the query", () => {
		// Pin behaviour: ampersand and other reserved chars must not break the
		// query string.
		expect(buildAdminPageUrl({ tab: "posts", query: "a&b", page: 1 })).toBe(
			"/admin?q=a%26b"
		)
	})
})
