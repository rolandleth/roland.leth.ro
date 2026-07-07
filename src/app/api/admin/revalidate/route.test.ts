import { beforeEach, describe, expect, it, vi } from "vitest"
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

	it("skips post entries whose section is unknown", async () => {
		await post({ posts: ["garbage/foo", "tech/ok"] })

		expect(vi.mocked(revalidatePost)).toHaveBeenCalledTimes(1)
		expect(vi.mocked(revalidatePost)).toHaveBeenCalledWith("tech", "ok")
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
