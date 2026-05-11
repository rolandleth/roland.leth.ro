import { revalidateTag } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { isPrismaNotFound, prisma } from "@/lib/db"
import { DELETE, GET, PUT } from "./route"
import type { Prisma } from "@/generated/prisma/client"

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db", () => ({
	prisma: {
		project: {
			findUnique: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			updateMany: vi.fn(),
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
	sortOrder: 3,
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
	function makeTx(updateMany = vi.fn()) {
		return {
			project: {
				findUnique: vi.mocked(prisma.project.findUnique),
				update: vi.mocked(prisma.project.update),
				updateMany,
			},
			projectSection: { deleteMany: vi.fn() },
			projectLink: { deleteMany: vi.fn() },
		} as unknown as Prisma.TransactionClient
	}

	beforeEach(() => {
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn(makeTx())
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

	it("shifts projects in [new, old) up when moving to a lower position", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject) // sortOrder: 3
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		const updateMany = vi.fn()
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn(makeTx(updateMany))
		)

		await PUT(putRequest("1", { sortOrder: 1 }), params("1"))

		expect(updateMany).toHaveBeenCalledWith({
			where: { id: { not: 1 }, sortOrder: { gte: 1, lt: 3 } },
			data: { sortOrder: { increment: 1 } },
		})
	})

	it("shifts projects in (old, new] down when moving to a higher position", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject) // sortOrder: 3
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		const updateMany = vi.fn()
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn(makeTx(updateMany))
		)

		await PUT(putRequest("1", { sortOrder: 6 }), params("1"))

		expect(updateMany).toHaveBeenCalledWith({
			where: { id: { not: 1 }, sortOrder: { gt: 3, lte: 6 } },
			data: { sortOrder: { decrement: 1 } },
		})
	})

	it("does not shift when sortOrder is unchanged", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject) // sortOrder: 3
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		const updateMany = vi.fn()
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn(makeTx(updateMany))
		)

		await PUT(putRequest("1", { sortOrder: 3 }), params("1"))

		expect(updateMany).not.toHaveBeenCalled()
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

	it("invalidates both old and new slug tags when a name change produces a new slug", async () => {
		// The previous-slug read happens inside the same Serializable txn as
		// the update; the transaction returns a project with the new slug. Both
		// per-slug tags must be busted so cached lookups on the old URL also
		// clear immediately.
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject) // slug: "my-app"
		const renamed = { ...existingProject, name: "New Name", slug: "new-name" }
		vi.mocked(prisma.project.update).mockResolvedValue(renamed)

		await PUT(putRequest("1", { name: "New Name" }), params("1"))

		expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(
			"project-my-app",
			"max"
		)
		expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(
			"project-new-name",
			"max"
		)
	})

	it("emits an info-level audit log on successful update including previousSlug", async () => {
		// Renames vs in-place edits are indistinguishable in the access log;
		// the audit line is the only signal that separates them.
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject) // slug: "my-app"
		const renamed = { ...existingProject, name: "New Name", slug: "new-name" }
		vi.mocked(prisma.project.update).mockResolvedValue(renamed)

		await PUT(putRequest("1", { name: "New Name" }), params("1"))

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:projects:PUT] success",
			{ id: renamed.id, slug: "new-name", previousSlug: "my-app" }
		)
	})

	it("reads the previous slug inside the same Serializable transaction as the update", async () => {
		// Without the in-txn read, two concurrent rename PUTs could both see
		// the same `previousSlug` and skip one of the per-slug tag busts. The
		// transaction is the load-bearing fix.
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject)
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)

		await PUT(putRequest("1", { name: "Other Name" }), params("1"))

		expect(prisma.$transaction).toHaveBeenCalledTimes(1)
		expect(prisma.project.findUnique).toHaveBeenCalledWith(
			expect.objectContaining({ select: { slug: true } })
		)
	})
})

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/projects/[id]", () => {
	beforeEach(() => {
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn({
					project: {
						delete: vi.mocked(prisma.project.delete),
						updateMany: vi.mocked(prisma.project.updateMany),
					},
				} as unknown as Prisma.TransactionClient)
		)
	})

	it("returns 204 on successful deletion", async () => {
		vi.mocked(prisma.project.delete).mockResolvedValue(existingProject)

		const response = await DELETE(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(204)
	})

	it("emits an info-level audit log on successful deletion", async () => {
		// Deletions are the highest-stakes admin write; the audit line is the
		// only structured signal a deletion happened.
		vi.mocked(prisma.project.delete).mockResolvedValue(existingProject)

		await DELETE(new Request("http://localhost"), params("1"))

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:projects:DELETE] success",
			{ id: 1, slug: existingProject.slug }
		)
	})

	it("shifts remaining projects down after deletion", async () => {
		vi.mocked(prisma.project.delete).mockResolvedValue(existingProject) // sortOrder: 3

		await DELETE(new Request("http://localhost"), params("1"))

		expect(vi.mocked(prisma.project.updateMany)).toHaveBeenCalledWith({
			where: { sortOrder: { gt: 3 } },
			data: { sortOrder: { decrement: 1 } },
		})
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
		vi.mocked(prisma.$transaction).mockRejectedValue({ code: "P2025" })

		const response = await DELETE(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(404)
	})

	it("returns 500 on an unexpected error", async () => {
		vi.mocked(prisma.$transaction).mockRejectedValue(new Error("DB failure"))

		const response = await DELETE(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(500)
	})
})
