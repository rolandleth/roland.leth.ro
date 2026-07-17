import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	revalidateAllGuides,
	revalidateGuide,
	revalidateGuideTopic,
} from "@/lib/db/guides"
import { revalidateAllPosts, revalidatePost } from "@/lib/db/posts"
import { revalidateAllProjects, revalidateProject } from "@/lib/db/projects"
import { POST } from "./route"

vi.mock("@/lib/db/posts", () => ({
	revalidateAllPosts: vi.fn(),
	revalidatePost: vi.fn(),
}))
vi.mock("@/lib/db/projects", () => ({
	revalidateAllProjects: vi.fn(),
	revalidateProject: vi.fn(),
}))
vi.mock("@/lib/db/guides", () => ({
	revalidateAllGuides: vi.fn(),
	revalidateGuide: vi.fn(),
	revalidateGuideTopic: vi.fn(),
}))

function post(body: unknown): Promise<Response> {
	return POST(
		new Request("http://localhost/api/admin/revalidate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		})
	)
}

beforeEach(() => {
	vi.clearAllMocks()
})

describe("POST /api/admin/revalidate", () => {
	it('busts every post detail page for `posts: "all"`', async () => {
		const response = await post({ posts: "all" })

		expect(response.status).toBe(200)
		expect(vi.mocked(revalidateAllPosts)).toHaveBeenCalledTimes(1)
		expect(vi.mocked(revalidatePost)).not.toHaveBeenCalled()
	})

	it("busts only the named posts, parsed as section/slug", async () => {
		await post({ posts: ["tech/foo", "life/bar"] })

		expect(vi.mocked(revalidatePost)).toHaveBeenCalledWith("tech", "foo")
		expect(vi.mocked(revalidatePost)).toHaveBeenCalledWith("life", "bar")
		expect(vi.mocked(revalidatePost)).toHaveBeenCalledTimes(2)
		expect(vi.mocked(revalidateAllPosts)).not.toHaveBeenCalled()
	})

	it("skips post entries whose section is unknown and reports them", async () => {
		const response = await post({ posts: ["garbage/foo", "tech/ok"] })

		expect(vi.mocked(revalidatePost)).toHaveBeenCalledTimes(1)
		expect(vi.mocked(revalidatePost)).toHaveBeenCalledWith("tech", "ok")
		expect(await response.json()).toEqual({
			ok: true,
			applied: { posts: ["tech/ok"] },
			skipped: { posts: ["garbage/foo"] },
		})
	})

	it("skips post entries that are not exactly section/slug", async () => {
		const response = await post({
			posts: ["bare-slug", "blog/tech/nested", "tech/", "tech/ok"],
		})

		expect(vi.mocked(revalidatePost)).toHaveBeenCalledTimes(1)
		expect(vi.mocked(revalidatePost)).toHaveBeenCalledWith("tech", "ok")

		const body = await response.json()
		expect(body.skipped.posts).toEqual([
			"bare-slug",
			"blog/tech/nested",
			"tech/",
		])
	})

	it("omits `skipped` keys for batches with nothing dropped", async () => {
		const response = await post({ posts: ["tech/ok"], projects: ["capsule"] })

		expect(await response.json()).toEqual({
			ok: true,
			applied: { posts: ["tech/ok"], projects: ["capsule"] },
			skipped: {},
		})
	})

	it('busts every project for `projects: "all"`', async () => {
		await post({ projects: "all" })

		expect(vi.mocked(revalidateAllProjects)).toHaveBeenCalledTimes(1)
		expect(vi.mocked(revalidateProject)).not.toHaveBeenCalled()
	})

	it("busts only the named projects", async () => {
		await post({ projects: ["capsule", "logbook"] })

		expect(vi.mocked(revalidateProject)).toHaveBeenCalledWith("capsule")
		expect(vi.mocked(revalidateProject)).toHaveBeenCalledWith("logbook")
		expect(vi.mocked(revalidateProject)).toHaveBeenCalledTimes(2)
	})

	it('busts every guide and topic page for `guides: "all"`', async () => {
		const response = await post({ guides: "all" })

		expect(vi.mocked(revalidateAllGuides)).toHaveBeenCalledTimes(1)
		expect(vi.mocked(revalidateGuide)).not.toHaveBeenCalled()
		expect(await response.json()).toEqual({
			ok: true,
			applied: { guides: "all" },
			skipped: {},
		})
	})

	it("busts each named guide slug as both a guide and a topic", async () => {
		await post({ guides: ["decision-journal", "making-better-decisions"] })

		expect(vi.mocked(revalidateGuide)).toHaveBeenCalledWith("decision-journal")
		expect(vi.mocked(revalidateGuideTopic)).toHaveBeenCalledWith(
			"decision-journal"
		)
		expect(vi.mocked(revalidateGuide)).toHaveBeenCalledWith(
			"making-better-decisions"
		)
		expect(vi.mocked(revalidateGuideTopic)).toHaveBeenCalledWith(
			"making-better-decisions"
		)
		expect(vi.mocked(revalidateAllGuides)).not.toHaveBeenCalled()
	})

	it("400s when neither field is provided", async () => {
		const response = await post({})

		expect(response.status).toBe(400)
	})

	it("returns 500 when a revalidation throws", async () => {
		vi.mocked(revalidateAllPosts).mockImplementationOnce(() => {
			throw new Error("revalidateTag unavailable")
		})

		const response = await post({ posts: "all" })

		expect(response.status).toBe(500)
	})
})
