import { revalidateTag } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { isPrismaUniqueConstraint, prisma } from "@/lib/db"
import { POST } from "./route"

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db", () => ({
	prisma: {
		post: {
			create: vi.fn(),
		},
	},
	isPrismaUniqueConstraint: vi.fn().mockReturnValue(false),
}))

function makeRequest(body: unknown) {
	return new Request("http://localhost/api/admin/posts", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
}

const validPayload = {
	title: "My New Post",
	body: "Some content here.",
	datetime: "2025-06-01-0900",
}

const createdPost = {
	id: 1,
	...validPayload,
	slug: "my-new-post",
	section: "tech" as const,
	published: true,
	summary: null,
	imageUrl: null,
	readingTime: null,
	createdAt: new Date(),
	updatedAt: new Date(),
}

beforeEach(() => {
	vi.resetAllMocks()
})

describe("POST /api/admin/posts", () => {
	it("returns 201 with the created post on a valid payload", async () => {
		vi.mocked(prisma.post.create).mockResolvedValue(createdPost)

		const response = await POST(makeRequest(validPayload))
		expect(response.status).toBe(201)

		const data = await response.json()
		expect(data.id).toBe(1)
	})

	it("emits an info-level audit log on successful create", async () => {
		// Without this line, an out-of-band post creation has no trace once the
		// access log rolls over. Pinned format so log-pipeline configs can grep
		// reliably.
		vi.mocked(prisma.post.create).mockResolvedValue(createdPost)

		await POST(makeRequest(validPayload))

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:posts:POST] success",
			{ id: 1, slug: createdPost.slug, section: createdPost.section }
		)
	})

	it("generates a slug from the title", async () => {
		vi.mocked(prisma.post.create).mockResolvedValue(createdPost)
		await POST(makeRequest(validPayload))

		const { data } = vi.mocked(prisma.post.create).mock.calls[0][0]
		expect(data.slug).toBe("my-new-post")
	})

	it("defaults section to 'tech' when omitted", async () => {
		vi.mocked(prisma.post.create).mockResolvedValue(createdPost)
		await POST(makeRequest(validPayload))

		const { data } = vi.mocked(prisma.post.create).mock.calls[0][0]
		expect(data.section).toBe("tech")
	})

	it("passes through an explicit section", async () => {
		vi.mocked(prisma.post.create).mockResolvedValue(createdPost)
		await POST(makeRequest({ ...validPayload, section: "life" }))

		const { data } = vi.mocked(prisma.post.create).mock.calls[0][0]
		expect(data.section).toBe("life")
	})

	it("returns 400 when title is missing", async () => {
		const { title: _, ...rest } = validPayload
		const response = await POST(makeRequest(rest))
		expect(response.status).toBe(400)
	})

	it("returns 400 when body is missing", async () => {
		const { body: _, ...rest } = validPayload
		const response = await POST(makeRequest(rest))
		expect(response.status).toBe(400)
	})

	it("returns 400 when datetime is missing", async () => {
		const { datetime: _, ...rest } = validPayload
		const response = await POST(makeRequest(rest))
		expect(response.status).toBe(400)
	})

	it("returns 400 when imageUrl is not http/https", async () => {
		const response = await POST(
			makeRequest({ ...validPayload, imageUrl: "javascript:evil()" })
		)
		expect(response.status).toBe(400)
	})

	it("returns 400 when section is not a known value", async () => {
		const response = await POST(
			makeRequest({ ...validPayload, section: "food" })
		)
		expect(response.status).toBe(400)
	})

	it("returns 500 when prisma throws an unexpected error", async () => {
		vi.mocked(prisma.post.create).mockRejectedValue(new Error("DB failure"))

		const response = await POST(makeRequest(validPayload))
		expect(response.status).toBe(500)
	})

	it("invalidates the blog section cache after creation", async () => {
		vi.mocked(prisma.post.create).mockResolvedValue(createdPost)

		await POST(makeRequest(validPayload))

		expect(revalidateTag).toHaveBeenCalledWith("blog-tech", "max")
	})

	it("invalidates the blog cache for the correct section", async () => {
		const lifePost = { ...createdPost, section: "life" as const }
		vi.mocked(prisma.post.create).mockResolvedValue(lifePost)

		await POST(makeRequest({ ...validPayload, section: "life" }))

		expect(revalidateTag).toHaveBeenCalledWith("blog-life", "max")
	})

	it("returns 409 when the slug collides with an existing post", async () => {
		// Two titles that slug-collide produce a Prisma unique-constraint error
		// (P2002). Surface as 409 so the admin UI can show 'A post with this
		// slug already exists' instead of a generic 500.
		vi.mocked(prisma.post.create).mockRejectedValue({ code: "P2002" })
		vi.mocked(isPrismaUniqueConstraint).mockReturnValue(true)

		const response = await POST(makeRequest(validPayload))
		expect(response.status).toBe(409)
		const data = await response.json()
		expect(data.error).toMatch(/already exists/)
		// 409s are interesting signal (admin form flap, intentional collision);
		// without this log, the path is invisible in production.
		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[api:admin:posts:POST] slug already exists",
			expect.objectContaining({ slug: expect.any(String) })
		)
	})

	it("returns 400 when the request body is not valid JSON", async () => {
		// parseJsonBody helper short-circuits before schema validation.
		const response = await POST(
			new Request("http://localhost/api/admin/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not-json",
			})
		)
		expect(response.status).toBe(400)
	})

	it("returns 400 when datetime is not yyyy-MM-dd-HHmm", async () => {
		// postCreateSchema regex catches this at write time so a malformed
		// value can't bubble as a 500 from postDatetimeToISO at feed-read time.
		const response = await POST(
			makeRequest({ ...validPayload, datetime: "garbage" })
		)
		expect(response.status).toBe(400)
	})
})
