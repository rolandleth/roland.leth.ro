import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { GET, POST } from "./route"
import type { Prisma } from "@/generated/prisma/client"

vi.mock("next/cache", () => ({
	revalidateTag: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
	prisma: {
		$transaction: vi.fn(),
		project: {
			findMany: vi.fn(),
			create: vi.fn(),
			count: vi.fn(),
			updateMany: vi.fn(),
		},
	},
}))

function makeRequest(body: unknown) {
	return new Request("http://localhost/api/admin/projects", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
}

const validPayload = {
	name: "My App",
	summary: "An iOS app that does things.",
	platform: "iOS",
}

const createdProject = {
	id: 1,
	name: "My App",
	slug: "my-app",
	summary: "An iOS app that does things.",
	platform: "iOS",
	role: null,
	accentColor: null,
	icon: null,
	heroImage: null,
	isFeatured: false,
	isDiscontinued: false,
	date: null,
	sortOrder: 1,
	createdAt: new Date(),
	updatedAt: new Date(),
	sections: [],
	links: [],
}

beforeEach(() => {
	vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/admin/projects", () => {
	it("returns all projects as JSON", async () => {
		vi.mocked(prisma.project.findMany).mockResolvedValue([createdProject])

		const response = await GET()
		expect(response.status).toBe(200)

		const data = await response.json()
		expect(data).toHaveLength(1)
		expect(data[0].name).toBe("My App")
	})
})

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe("POST /api/admin/projects", () => {
	function makeTx(updateMany = vi.fn()) {
		return {
			project: {
				create: vi.mocked(prisma.project.create),
				count: vi.mocked(prisma.project.count),
				updateMany,
			},
		} as unknown as Prisma.TransactionClient
	}

	beforeEach(() => {
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn(makeTx())
		)
		vi.mocked(prisma.project.count).mockResolvedValue(0)
	})

	it("returns 201 with the created project on a valid payload", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)

		const response = await POST(makeRequest(validPayload))
		expect(response.status).toBe(201)

		const data = await response.json()
		expect(data.id).toBe(1)
	})

	it("generates a slug from the project name", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)
		await POST(makeRequest(validPayload))

		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		expect(data.slug).toBe("my-app")
	})

	it("appends after the last project when no sortOrder is provided", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)
		vi.mocked(prisma.project.count).mockResolvedValue(5)
		const updateMany = vi.fn()
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn(makeTx(updateMany))
		)

		await POST(makeRequest(validPayload))

		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		expect(data.sortOrder).toBe(6)
		expect(updateMany).not.toHaveBeenCalled()
	})

	it("shifts projects at or after the target position when sortOrder is provided", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)
		const updateMany = vi.fn()
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn(makeTx(updateMany))
		)

		await POST(makeRequest({ ...validPayload, sortOrder: 3 }))

		expect(updateMany).toHaveBeenCalledWith({
			where: { sortOrder: { gte: 3 } },
			data: { sortOrder: { increment: 1 } },
		})
		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		expect(data.sortOrder).toBe(3)
	})

	it("accepts optional sections and links", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)

		const response = await POST(
			makeRequest({
				...validPayload,
				sections: [
					{
						title: "Overview",
						description: "Main overview.",
						images: [{ url: "https://example.com/img.png" }],
					},
				],
				links: [{ label: "App Store", url: "https://apps.apple.com/app" }],
			})
		)
		expect(response.status).toBe(201)
	})

	it("returns 400 when name is missing", async () => {
		const { name: _, ...rest } = validPayload
		const response = await POST(makeRequest(rest))
		expect(response.status).toBe(400)
	})

	it("returns 400 when summary is missing", async () => {
		const { summary: _, ...rest } = validPayload
		const response = await POST(makeRequest(rest))
		expect(response.status).toBe(400)
	})

	it("returns 400 when platform is missing", async () => {
		const { platform: _, ...rest } = validPayload
		const response = await POST(makeRequest(rest))
		expect(response.status).toBe(400)
	})

	it("returns 400 when a link has a non-http URL", async () => {
		const response = await POST(
			makeRequest({
				...validPayload,
				links: [{ label: "Bad", url: "javascript:evil()" }],
			})
		)
		expect(response.status).toBe(400)
	})

	it("returns 400 when a section image has a non-http URL", async () => {
		const response = await POST(
			makeRequest({
				...validPayload,
				sections: [
					{
						title: "S",
						description: "D",
						// eslint-disable-next-line sonarjs/no-clear-text-protocols
						images: [{ url: "ftp://bad.com/img.png" }],
					},
				],
			})
		)
		expect(response.status).toBe(400)
	})

	it("returns 500 when prisma throws an unexpected error", async () => {
		vi.mocked(prisma.$transaction).mockRejectedValue(new Error("DB failure"))

		const response = await POST(makeRequest(validPayload))
		expect(response.status).toBe(500)
	})
})
