import { beforeEach, describe, expect, it, vi } from "vitest"
import { lookupLegacySlug } from "@/lib/db/legacySlug"
import { getAllPublishedPostSlugs } from "@/lib/db/posts"
import { getAllProjectSlugs } from "@/lib/db/projects"

vi.mock("@/lib/db/posts", () => ({ getAllPublishedPostSlugs: vi.fn() }))
vi.mock("@/lib/db/projects", () => ({ getAllProjectSlugs: vi.fn() }))

beforeEach(() => {
	vi.clearAllMocks()
	vi.mocked(getAllPublishedPostSlugs).mockResolvedValue([])
	vi.mocked(getAllProjectSlugs).mockResolvedValue([])
})

describe("lookupLegacySlug", () => {
	it("resolves an explicit legacy alias without touching the slug indexes", async () => {
		// The alias check short-circuits before either cached index is read.
		expect(await lookupLegacySlug("final-version--for-now-")).toEqual({
			kind: "post",
			section: "tech",
			slug: "final-version-for-now",
		})
		expect(getAllPublishedPostSlugs).not.toHaveBeenCalled()
		expect(getAllProjectSlugs).not.toHaveBeenCalled()
	})

	it("resolves a known published post slug from the cached index", async () => {
		vi.mocked(getAllPublishedPostSlugs).mockResolvedValue([
			{
				slug: "my-post",
				section: "tech",
				datetime: "2024-06-01-1200",
				updatedAt: new Date(),
			},
		] as never)

		expect(await lookupLegacySlug("my-post")).toEqual({
			kind: "post",
			section: "tech",
			slug: "my-post",
		})
	})

	it("resolves a known project slug when no post matches", async () => {
		vi.mocked(getAllProjectSlugs).mockResolvedValue([
			{ slug: "my-app", updatedAt: new Date() },
		] as never)

		expect(await lookupLegacySlug("my-app")).toEqual({
			kind: "project",
			slug: "my-app",
		})
	})

	it("prefers a post over a project sharing the slug", async () => {
		vi.mocked(getAllPublishedPostSlugs).mockResolvedValue([
			{
				slug: "shared",
				section: "life",
				datetime: "2024-06-01-1200",
				updatedAt: new Date(),
			},
		] as never)
		vi.mocked(getAllProjectSlugs).mockResolvedValue([
			{ slug: "shared", updatedAt: new Date() },
		] as never)

		expect(await lookupLegacySlug("shared")).toEqual({
			kind: "post",
			section: "life",
			slug: "shared",
		})
	})

	it("returns null for a slug in neither the alias map nor the indexes", async () => {
		expect(await lookupLegacySlug("nothing-here")).toBeNull()
	})

	it("resolves purely from in-memory indexes — no per-slug DB fallback", async () => {
		// The point of the refactor: a junk root-level slug scans the cached
		// indexes and 404s. There is no prisma dependency in this module to probe.
		expect(await lookupLegacySlug("wp-login.php")).toBeNull()
		expect(getAllPublishedPostSlugs).toHaveBeenCalledTimes(1)
		expect(getAllProjectSlugs).toHaveBeenCalledTimes(1)
	})

	it("does not match a future-dated post (excluded upstream by the index)", async () => {
		// `getAllPublishedPostSlugs` applies the `datetime <= now` filter itself,
		// so a scheduled post simply isn't in the list handed to us yet.
		vi.mocked(getAllPublishedPostSlugs).mockResolvedValue([])

		expect(await lookupLegacySlug("scheduled-post")).toBeNull()
	})
})
