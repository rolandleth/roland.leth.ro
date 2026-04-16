import { revalidateTag } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { isPrismaNotFound, prisma } from "@/lib/db"
import { DELETE, GET, PUT } from "./route"

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db", () => ({
	prisma: {
		post: {
			findUnique: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
	},
	isPrismaNotFound: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function params(id: string) {
	return { params: Promise.resolve({ id }) }
}

function putRequest(id: string, body: unknown) {
	return new Request(`http://localhost/api/admin/posts/${id}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
}

const existingPost = {
	id: 1,
	title: "Original Title",
	slug: "original-title",
	body: "Original body.",
	section: "tech",
	datetime: "2025-01-01-1200",
	published: true,
	summary: null,
	imageUrl: null,
	readingTime: null,
	createdAt: new Date(),
	updatedAt: new Date(),
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(isPrismaNotFound).mockReturnValue(false)
})

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/admin/posts/[id]", () => {
	it("returns 200 with the post when found", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)

		const response = await GET(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(200)

		const data = await response.json()
		expect(data.id).toBe(1)
	})

	it("returns 404 when the post is not found", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(null)

		const response = await GET(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(404)
	})

	it("returns 400 for a non-numeric id", async () => {
		const response = await GET(new Request("http://localhost"), params("abc"))
		expect(response.status).toBe(400)
	})
})

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe("PUT /api/admin/posts/[id]", () => {
	it("returns 200 with the updated post", async () => {
		const updated = {
			...existingPost,
			title: "Updated Title",
			slug: "updated-title",
		}
		vi.mocked(prisma.post.update).mockResolvedValue(updated)

		const response = await PUT(
			putRequest("1", { title: "Updated Title" }),
			params("1")
		)
		expect(response.status).toBe(200)

		const data = await response.json()
		expect(data.title).toBe("Updated Title")
	})

	it("regenerates the slug when title changes", async () => {
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)
		await PUT(putRequest("1", { title: "Brand New Title" }), params("1"))

		const { data } = vi.mocked(prisma.post.update).mock.calls[0][0]
		expect(data.slug).toBe("brand-new-title")
	})

	it("does not include slug in update when title is not changed", async () => {
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)
		await PUT(putRequest("1", { published: false }), params("1"))

		const { data } = vi.mocked(prisma.post.update).mock.calls[0][0]
		expect(data.slug).toBeUndefined()
	})

	it("returns 400 for a non-numeric id", async () => {
		const response = await PUT(putRequest("abc", { title: "T" }), params("abc"))
		expect(response.status).toBe(400)
	})

	it("returns 400 for an invalid payload", async () => {
		const response = await PUT(
			putRequest("1", { imageUrl: "javascript:evil()" }),
			params("1")
		)
		expect(response.status).toBe(400)
	})

	it("returns 404 when the post does not exist", async () => {
		vi.mocked(isPrismaNotFound).mockReturnValue(true)
		vi.mocked(prisma.post.update).mockRejectedValue({ code: "P2025" })

		const response = await PUT(putRequest("1", { title: "T" }), params("1"))
		expect(response.status).toBe(404)
	})

	it("returns 500 on an unexpected prisma error", async () => {
		vi.mocked(prisma.post.update).mockRejectedValue(new Error("DB failure"))

		const response = await PUT(putRequest("1", { title: "T" }), params("1"))
		expect(response.status).toBe(500)
	})

	it("invalidates the blog section cache after update", async () => {
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)

		await PUT(putRequest("1", { title: "Updated Title" }), params("1"))

		expect(revalidateTag).toHaveBeenCalledWith("blog-tech", "max")
	})
})

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/posts/[id]", () => {
	it("returns 204 on successful deletion", async () => {
		vi.mocked(prisma.post.delete).mockResolvedValue(existingPost)

		const response = await DELETE(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(204)
	})

	it("returns 400 for a non-numeric id", async () => {
		const response = await DELETE(
			new Request("http://localhost"),
			params("abc")
		)
		expect(response.status).toBe(400)
	})

	it("returns 404 when the post does not exist", async () => {
		vi.mocked(isPrismaNotFound).mockReturnValue(true)
		vi.mocked(prisma.post.delete).mockRejectedValue({ code: "P2025" })

		const response = await DELETE(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(404)
	})

	it("returns 500 on an unexpected prisma error", async () => {
		vi.mocked(prisma.post.delete).mockRejectedValue(new Error("DB failure"))

		const response = await DELETE(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(500)
	})

	it("invalidates the blog section cache after deletion", async () => {
		vi.mocked(prisma.post.delete).mockResolvedValue(existingPost)

		const response = await DELETE(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(204)
		expect(revalidateTag).toHaveBeenCalledWith("blog-tech", "max")
	})
})
