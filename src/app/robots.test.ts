import { beforeEach, describe, expect, it, vi } from "vitest"
import robots from "@/app/robots"
import { siteBase } from "@/lib/api/request"
import type { MetadataRoute } from "next"

vi.mock("@/lib/api/request", () => ({
	siteBase: vi.fn(),
}))

const BASE = "https://roland.leth.ro"

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(siteBase).mockResolvedValue(BASE)
})

// #region Rules

type Rule = {
	userAgent?: string | string[]
	allow?: string | string[]
	disallow?: string | string[]
}

function ruleFor(
	rules: MetadataRoute.Robots["rules"],
	userAgent: string
): Rule | undefined {
	const list = Array.isArray(rules) ? rules : [rules]

	return list.find((rule) => rule?.userAgent === userAgent)
}

describe("robots — rules", () => {
	it("exposes the allow-all rule and the CCBot partial block", async () => {
		const result = await robots()
		expect(result.rules).toEqual([
			{ userAgent: "*", allow: "/api/feed/", disallow: "/api/" },
			{ userAgent: "CCBot", disallow: ["/about$", "/life$"] },
		])
	})

	it("disallows /api/ as crawl-junk for all crawlers", async () => {
		const result = await robots()
		expect(ruleFor(result.rules, "*")?.disallow).toBe("/api/")
	})

	it("re-allows the public RSS feed under /api/feed/", async () => {
		const result = await robots()
		expect(ruleFor(result.rules, "*")?.allow).toBe("/api/feed/")
	})

	it("exact-blocks /about and /life for CCBot only", async () => {
		const result = await robots()
		// `$`-anchored so the block can't leak onto a future `/lifestyle`.
		expect(ruleFor(result.rules, "CCBot")?.disallow).toEqual([
			"/about$",
			"/life$",
		])
	})

	it("does not advertise admin or auth paths", async () => {
		const serialized = JSON.stringify(await robots())
		expect(serialized).not.toContain("admin")
		expect(serialized).not.toContain("auth")
		expect(serialized).not.toContain("login")
	})
})

// #endregion

// #region Sitemap

describe("robots — sitemap", () => {
	it("points at the canonical sitemap URL", async () => {
		const result = await robots()
		expect(result.sitemap).toBe(`${BASE}/sitemap.xml`)
	})

	it("derives the host from siteBase", async () => {
		vi.mocked(siteBase).mockResolvedValue("https://preview.example.com")
		const result = await robots()
		expect(result.sitemap).toBe("https://preview.example.com/sitemap.xml")
	})
})

// #endregion
