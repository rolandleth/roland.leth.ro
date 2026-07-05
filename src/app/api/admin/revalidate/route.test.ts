import { beforeEach, describe, expect, it, vi } from "vitest"
import { revalidatePostSection } from "@/lib/db/posts"
import { revalidateAllProjects } from "@/lib/db/projects"
import { SECTIONS } from "@/lib/db/sections"
import { POST } from "./route"

vi.mock("@/lib/db/posts", () => ({ revalidatePostSection: vi.fn() }))
vi.mock("@/lib/db/projects", () => ({ revalidateAllProjects: vi.fn() }))

beforeEach(() => {
	vi.clearAllMocks()
})

describe("POST /api/admin/revalidate", () => {
	it("revalidates every post section and all projects", async () => {
		const response = await POST()

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.ok).toBe(true)

		for (const section of SECTIONS) {
			expect(vi.mocked(revalidatePostSection)).toHaveBeenCalledWith(section)
		}
		expect(vi.mocked(revalidatePostSection)).toHaveBeenCalledTimes(
			SECTIONS.length
		)
		expect(vi.mocked(revalidateAllProjects)).toHaveBeenCalledTimes(1)
	})

	it("returns 500 when a revalidation throws", async () => {
		vi.mocked(revalidatePostSection).mockImplementationOnce(() => {
			throw new Error("revalidateTag unavailable")
		})

		const response = await POST()

		expect(response.status).toBe(500)
	})
})
