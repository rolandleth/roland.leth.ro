import { revalidateTag } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { isPrismaNotFound, prisma } from "@/lib/db/db"
import { DELETE, GET, PUT } from "./route"
import type { Prisma } from "@/generated/prisma/client"

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db/db", () => ({
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
	metaTitle: null,
	keywords: [],
	offers: null,
	applicationCategory: null,
	bucket: PlatformBucket.iOS,
	platformTags: [PlatformTag.iOS],
	role: null,
	accentColor: null,
	icon: null,
	cardImage: null,
	ogImage: null,
	heroImage: null,
	isFeatured: false,
	isDiscontinued: false,
	date: null,
	sortOrder: 3,
	createdAt: new Date(),
	updatedAt: new Date(),
	sections: [],
	links: [],
	faqs: [],
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
			projectFaq: { deleteMany: vi.fn() },
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
		await PUT(
			putRequest("1", {
				bucket: PlatformBucket.Mac,
				platformTags: [PlatformTag.macOS],
			}),
			params("1")
		)

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

	it("clears existing FAQs and recreates them when faqs is provided", async () => {
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		const deleteFaqs = vi.fn()
		const tx = {
			project: {
				findUnique: vi.mocked(prisma.project.findUnique),
				update: vi.mocked(prisma.project.update),
				updateMany: vi.fn(),
			},
			projectSection: { deleteMany: vi.fn() },
			projectLink: { deleteMany: vi.fn() },
			projectFaq: { deleteMany: deleteFaqs },
		} as unknown as Prisma.TransactionClient
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => fn(tx)
		)

		await PUT(
			putRequest("1", {
				faqs: [{ question: "How?", answer: "Like so." }],
			}),
			params("1")
		)

		expect(deleteFaqs).toHaveBeenCalledWith({ where: { projectId: 1 } })
		const { data } = vi.mocked(prisma.project.update).mock.calls[0][0]
		expect(data.faqs).toEqual({
			create: [{ question: "How?", answer: "Like so.", sortOrder: 0 }],
		})
	})

	it("clears all FAQs when faqs is an explicit empty array", async () => {
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		const deleteFaqs = vi.fn()
		const tx = {
			project: {
				findUnique: vi.mocked(prisma.project.findUnique),
				update: vi.mocked(prisma.project.update),
				updateMany: vi.fn(),
			},
			projectSection: { deleteMany: vi.fn() },
			projectLink: { deleteMany: vi.fn() },
			projectFaq: { deleteMany: deleteFaqs },
		} as unknown as Prisma.TransactionClient
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => fn(tx)
		)

		await PUT(putRequest("1", { faqs: [] }), params("1"))

		expect(deleteFaqs).toHaveBeenCalledWith({ where: { projectId: 1 } })
		const { data } = vi.mocked(prisma.project.update).mock.calls[0][0]
		expect(data.faqs).toEqual({ create: [] })
	})

	it("leaves FAQs untouched when faqs is omitted", async () => {
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		const deleteFaqs = vi.fn()
		const tx = {
			project: {
				findUnique: vi.mocked(prisma.project.findUnique),
				update: vi.mocked(prisma.project.update),
				updateMany: vi.fn(),
			},
			projectSection: { deleteMany: vi.fn() },
			projectLink: { deleteMany: vi.fn() },
			projectFaq: { deleteMany: deleteFaqs },
		} as unknown as Prisma.TransactionClient
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => fn(tx)
		)

		await PUT(putRequest("1", { name: "Renamed" }), params("1"))

		expect(deleteFaqs).not.toHaveBeenCalled()
		const { data } = vi.mocked(prisma.project.update).mock.calls[0][0]
		// Prisma treats `undefined` as "skip" — an omitted faqs array must not wipe rows.
		expect(data.faqs).toBeUndefined()
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
			{
				id: renamed.id,
				slug: "new-name",
				section: null,
				sortOrder: renamed.sortOrder,
				previousSection: null,
				previousSlug: "my-app",
				batchId: null,
			}
		)
	})

	it("audits previousSlug as null when the name is updated but the slug stays identical", async () => {
		// Aligns with the posts PUT contract: `previousSlug` semantically means
		// "the slug renamed, here's what it was", not "name was edited". A
		// no-op rename whose normalized slug stays identical doesn't surface.
		// Pre-fix: projects PUT emitted `previousSlug = "my-app"` even when the
		// slug didn't change, which crowded the audit log with non-events.
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject) // slug: "my-app"
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)

		// New name normalizes to the same slug — the schema/route don't enforce
		// equality, but the test mock keeps `slug: "my-app"` so we control the
		// branch.
		await PUT(putRequest("1", { name: "My App" }), params("1"))

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:projects:PUT] success",
			expect.objectContaining({ previousSlug: null })
		)
	})

	it("audits sortOrder on every PUT so reorders are distinguishable from in-place edits", async () => {
		// A reorder updates `sortOrder` but no other observable column; without
		// the field on the audit line, a reorder is indistinguishable from a
		// metadata edit. Pin the contract so a future "drop the field" PR
		// surfaces.
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject)
		const reordered = { ...existingProject, sortOrder: 7 }
		vi.mocked(prisma.project.update).mockResolvedValue(reordered)

		await PUT(putRequest("1", { sortOrder: 7 }), params("1"))

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:projects:PUT] success",
			expect.objectContaining({ sortOrder: 7 })
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
			{
				id: 1,
				slug: existingProject.slug,
				section: null,
				sortOrder: null,
				previousSection: null,
				previousSlug: null,
				batchId: null,
			}
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
