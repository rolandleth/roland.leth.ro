import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { GET, POST } from "./route"

vi.mock("@/lib/db", () => ({
	prisma: {
		post: {
			findMany: vi.fn(),
			create: vi.fn(),
		},
	},
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
	section: "tech",
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

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/admin/posts", () => {
	it("returns all posts as JSON", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([createdPost])

		const response = await GET()
		expect(response.status).toBe(200)

		const data = await response.json()
		expect(data).toHaveLength(1)
		expect(data[0].id).toBe(1)
	})
})

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe("POST /api/admin/posts", () => {
	it("returns 201 with the created post on a valid payload", async () => {
		vi.mocked(prisma.post.create).mockResolvedValue(createdPost)

		const response = await POST(makeRequest(validPayload))
		expect(response.status).toBe(201)

		const data = await response.json()
		expect(data.id).toBe(1)
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
})
