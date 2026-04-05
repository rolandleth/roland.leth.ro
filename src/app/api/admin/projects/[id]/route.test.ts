import { beforeEach, describe, expect, it, vi } from "vitest"
import { isPrismaNotFound, prisma } from "@/lib/db"
import { DELETE, GET, PUT } from "./route"
import type { Prisma } from "@/generated/prisma/client"

vi.mock("@/lib/db", () => ({
	prisma: {
		project: {
			findUnique: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		$transaction: vi.fn(),
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
	return new Request(`http://localhost/api/admin/projects/${id}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
}

const existingProject = {
	id: 1,
	name: "My App",
	slug: "my-app",
	summary: "An app.",
	platform: "iOS",
	role: null,
	accentColor: null,
	icon: null,
	heroImage: null,
	isFeatured: false,
	isDiscontinued: false,
	date: null,
	sortOrder: 0,
	createdAt: new Date(),
	updatedAt: new Date(),
	sections: [],
	links: [],
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(isPrismaNotFound).mockReturnValue(false)
})

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/admin/projects/[id]", () => {
	it("returns 200 with the project when found", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject)

		const response = await GET(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(200)

		const data = await response.json()
		expect(data.id).toBe(1)
	})

	it("returns 404 when the project is not found", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

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

describe("PUT /api/admin/projects/[id]", () => {
	beforeEach(() => {
		// The PUT handler wraps everything in a $transaction; mock it to call
		// through to prisma.project.update so we can assert on update args.
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn({
					project: { update: vi.mocked(prisma.project.update) },
					projectSection: { deleteMany: vi.fn() },
					projectLink: { deleteMany: vi.fn() },
				} as unknown as Prisma.TransactionClient)
		)
	})

	it("returns 200 with the updated project", async () => {
		const updated = {
			...existingProject,
			name: "Renamed App",
			slug: "renamed-app",
		}
		vi.mocked(prisma.project.update).mockResolvedValue(updated)

		const response = await PUT(
			putRequest("1", { name: "Renamed App" }),
			params("1")
		)
		expect(response.status).toBe(200)

		const data = await response.json()
		expect(data.name).toBe("Renamed App")
	})

	it("regenerates the slug when name changes", async () => {
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		await PUT(putRequest("1", { name: "Brand New Name" }), params("1"))

		const { data } = vi.mocked(prisma.project.update).mock.calls[0][0]
		expect(data.slug).toBe("brand-new-name")
	})

	it("does not include slug when name is not changed", async () => {
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		await PUT(putRequest("1", { platform: "macOS" }), params("1"))

		const { data } = vi.mocked(prisma.project.update).mock.calls[0][0]
		expect(data.slug).toBeUndefined()
	})

	it("returns 400 for a non-numeric id", async () => {
		const response = await PUT(putRequest("abc", { name: "X" }), params("abc"))
		expect(response.status).toBe(400)
	})

	it("returns 400 for an invalid payload (bad link URL)", async () => {
		const response = await PUT(
			putRequest("1", { links: [{ label: "Bad", url: "javascript:evil()" }] }),
			params("1")
		)
		expect(response.status).toBe(400)
	})

	it("returns 404 when the project does not exist", async () => {
		vi.mocked(isPrismaNotFound).mockReturnValue(true)
		vi.mocked(prisma.$transaction).mockRejectedValue({ code: "P2025" })

		const response = await PUT(putRequest("1", { name: "X" }), params("1"))
		expect(response.status).toBe(404)
	})

	it("returns 500 on an unexpected error", async () => {
		vi.mocked(prisma.$transaction).mockRejectedValue(new Error("DB failure"))

		const response = await PUT(putRequest("1", { name: "X" }), params("1"))
		expect(response.status).toBe(500)
	})
})

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/projects/[id]", () => {
	it("returns 204 on successful deletion", async () => {
		vi.mocked(prisma.project.delete).mockResolvedValue(existingProject)

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

	it("returns 404 when the project does not exist", async () => {
		vi.mocked(isPrismaNotFound).mockReturnValue(true)
		vi.mocked(prisma.project.delete).mockRejectedValue({ code: "P2025" })

		const response = await DELETE(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(404)
	})

	it("returns 500 on an unexpected error", async () => {
		vi.mocked(prisma.project.delete).mockRejectedValue(new Error("DB failure"))

		const response = await DELETE(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(500)
	})
})
