import { beforeEach, describe, expect, it, vi } from "vitest"
import { lookupLegacySlug } from "@/lib/legacySlug"
import LegacySlugPage from "./page"

vi.mock("@/lib/legacySlug", () => ({
	lookupLegacySlug: vi.fn(),
}))

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NOT_FOUND")
	}),
	permanentRedirect: vi.fn((url: string) => {
		throw new Error(`REDIRECT:${url}`)
	}),
}))

function makeParams(slug: string) {
	return { params: Promise.resolve({ slug }) }
}

beforeEach(() => {
	vi.resetAllMocks()
})

describe("LegacySlugPage", () => {
	it("calls permanentRedirect to /blog/:section/:slug when a post is found", async () => {
		vi.mocked(lookupLegacySlug).mockResolvedValue({
			kind: "post",
			section: "tech",
			slug: "my-old-post",
		})
		await expect(LegacySlugPage(makeParams("my-old-post"))).rejects.toThrow(
			"REDIRECT:/blog/tech/my-old-post"
		)
	})

	it("calls permanentRedirect with the matched section for life posts", async () => {
		vi.mocked(lookupLegacySlug).mockResolvedValue({
			kind: "post",
			section: "life",
			slug: "a-life-post",
		})
		await expect(LegacySlugPage(makeParams("a-life-post"))).rejects.toThrow(
			"REDIRECT:/blog/life/a-life-post"
		)
	})

	it("calls permanentRedirect to /projects/:slug when a project is found", async () => {
		vi.mocked(lookupLegacySlug).mockResolvedValue({
			kind: "project",
			slug: "my-app",
		})
		await expect(LegacySlugPage(makeParams("my-app"))).rejects.toThrow(
			"REDIRECT:/projects/my-app"
		)
	})

	it("calls notFound when the slug is neither a post nor a project", async () => {
		vi.mocked(lookupLegacySlug).mockResolvedValue(null)
		await expect(LegacySlugPage(makeParams("unknown"))).rejects.toThrow(
			"NOT_FOUND"
		)
	})

	it("forwards the slug from the route params to the lookup", async () => {
		vi.mocked(lookupLegacySlug).mockResolvedValue(null)
		// Swallow the NOT_FOUND throw; we only care the lookup was hit correctly.
		await LegacySlugPage(makeParams("specific-slug")).catch(() => {})
		expect(lookupLegacySlug).toHaveBeenCalledWith("specific-slug")
	})
})
