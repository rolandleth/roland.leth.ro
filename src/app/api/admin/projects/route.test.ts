import { beforeEach, describe, expect, it, vi } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/db"
import { POST } from "./route"
import type { Prisma } from "@/generated/prisma/client"

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db/db", () => ({
	prisma: {
		$transaction: vi.fn(),
		project: {
			create: vi.fn(),
			count: vi.fn(),
			updateMany: vi.fn(),
		},
	},
	isPrismaUniqueConstraint: vi.fn().mockReturnValue(false),
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
	bucket: PlatformBucket.iOS,
	platformTags: [PlatformTag.iOS],
}

const createdProject = {
	id: 1,
	name: "My App",
	slug: "my-app",
	summary: "An iOS app that does things.",
	bucket: PlatformBucket.iOS,
	platformTags: [PlatformTag.iOS],
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

	it("emits an info-level audit log on successful create", async () => {
		// Without this line, an out-of-band project creation has no trace once
		// the access log rolls over.
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)

		await POST(makeRequest(validPayload))

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:projects:POST] success",
			{
				id: createdProject.id,
				slug: createdProject.slug,
				section: null,
				sortOrder: createdProject.sortOrder,
				previousSection: null,
				previousSlug: null,
				batchId: null,
			}
		)
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
		// With 5 existing projects at sortOrder 0..4, the new one slots in at 5
		// (0-indexed). `count + 1` would create a gap that the reorder helper
		// and DELETE reindex both assume doesn't exist.
		expect(data.sortOrder).toBe(5)
		expect(updateMany).not.toHaveBeenCalled()
	})

	it("shifts projects at or after the target position when sortOrder is provided", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)
		// Count=5 so sortOrder=3 is in-range and not clamped.
		vi.mocked(prisma.project.count).mockResolvedValue(5)
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

	it("clamps sortOrder to the current count to avoid leaving gaps", async () => {
		// count=3, sortOrder=10: without clamping, the new project would land
		// at slot 10 leaving slots 3..9 empty. Clamp to 3 (the next free slot).
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)
		vi.mocked(prisma.project.count).mockResolvedValue(3)
		const updateMany = vi.fn()
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn(makeTx(updateMany))
		)

		await POST(makeRequest({ ...validPayload, sortOrder: 10 }))

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

	it("returns 400 when bucket is missing", async () => {
		const { bucket: _, ...rest } = validPayload
		const response = await POST(makeRequest(rest))
		expect(response.status).toBe(400)
	})

	it("returns 400 when platformTags is missing", async () => {
		const { platformTags: _, ...rest } = validPayload
		const response = await POST(makeRequest(rest))
		expect(response.status).toBe(400)
	})

	it("returns 400 when platformTags is empty", async () => {
		const response = await POST(
			makeRequest({ ...validPayload, platformTags: [] })
		)
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

	it("returns 409 when the slug collides with an existing project", async () => {
		vi.mocked(prisma.$transaction).mockRejectedValue({ code: "P2002" })
		const { isPrismaUniqueConstraint } = await import("@/lib/db/db")
		vi.mocked(isPrismaUniqueConstraint).mockReturnValue(true)

		const response = await POST(makeRequest(validPayload))
		expect(response.status).toBe(409)
		const data = await response.json()
		expect(data.error).toMatch(/already exists/)
		// 409s are interesting signal (admin form flap, intentional collision);
		// without this log, the path is invisible in production.
		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[api:admin:projects:POST] slug already exists",
			expect.objectContaining({ slug: expect.any(String) })
		)
	})

	it("returns 400 when the request body is not valid JSON", async () => {
		const response = await POST(
			new Request("http://localhost/api/admin/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not-json",
			})
		)
		expect(response.status).toBe(400)
	})
})
