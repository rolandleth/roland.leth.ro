import { revalidateTag } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { isPrismaNotFound, prisma } from "@/lib/db/db"
import { EMPTY_PRODUCT_PAGE_FIELDS } from "@/test/fixtures"
import { DELETE, GET, PUT } from "./route"
import type { Prisma } from "@/generated/prisma/client"

vi.mock("@/lib/api/requireAdmin", async () => {
	const { requireAdminMockFactory } = await import("@/test/mocks/requireAdmin")

	return requireAdminMockFactory()
})

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
		guide: { count: vi.fn() },
		guideTopic: { count: vi.fn() },
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
	isOwnApp: false,
	...EMPTY_PRODUCT_PAGE_FIELDS,
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
		const updated = { ...existingProject, name: "Renamed App" }
		vi.mocked(prisma.project.update).mockResolvedValue(updated)

		const response = await PUT(
			putRequest("1", { name: "Renamed App" }),
			params("1")
		)
		expect(response.status).toBe(200)

		const data = await response.json()
		expect(data.name).toBe("Renamed App")
	})

	it("keeps the slug when the name changes", async () => {
		// Guides and topics name a project by slug with no foreign key, so a
		// slug that moved with the name orphaned them and moved the public URL.
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		await PUT(putRequest("1", { name: "Brand New Name" }), params("1"))

		const { data } = vi.mocked(prisma.project.update).mock.calls[0][0]
		expect(data.name).toBe("Brand New Name")
		expect(data.slug).toBeUndefined()
	})

	it("ignores a slug sent in the body", async () => {
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		const response = await PUT(
			putRequest("1", { name: "My App", slug: "hijacked" }),
			params("1")
		)

		expect(response.status).toBe(200)
		const { data } = vi.mocked(prisma.project.update).mock.calls[0][0]
		expect(data.slug).toBeUndefined()
	})

	it("busts only the project's own slug tag on a rename", async () => {
		vi.mocked(prisma.project.update).mockResolvedValue({
			...existingProject,
			name: "Brand New Name",
		})
		await PUT(putRequest("1", { name: "Brand New Name" }), params("1"))

		const bustedTags = vi.mocked(revalidateTag).mock.calls.map(([tag]) => tag)
		expect(bustedTags).toContain("project-my-app")
		expect(bustedTags.some((tag) => tag.includes("brand-new-name"))).toBe(false)
	})

	it("passes isFeatured, isDiscontinued and isOwnApp through to the update", async () => {
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		await PUT(
			putRequest("1", {
				isFeatured: true,
				isDiscontinued: true,
				isOwnApp: true,
			}),
			params("1")
		)

		const { data } = vi.mocked(prisma.project.update).mock.calls[0][0]
		expect(data.isFeatured).toBe(true)
		expect(data.isDiscontinued).toBe(true)
		expect(data.isOwnApp).toBe(true)
	})

	// Prisma skips an `undefined` column, so the stored flag stays as it is; a
	// defaulted `false` would reset it on every save that doesn't send it.
	it("leaves the flags unchanged when they're omitted", async () => {
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		await PUT(putRequest("1", { name: "Renamed App" }), params("1"))

		const { data } = vi.mocked(prisma.project.update).mock.calls[0][0]
		expect(data.isFeatured).toBeUndefined()
		expect(data.isDiscontinued).toBeUndefined()
		expect(data.isOwnApp).toBeUndefined()
	})

	// The admin form edits the product-page text fields but not `plans` or
	// `palette`, which are manifest-only. A save that omits them must not touch
	// what the import wrote.
	it("leaves plans and palette unchanged when a save omits them", async () => {
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		await PUT(
			putRequest("1", { heroEyebrow: "Food and symptom journal" }),
			params("1")
		)

		const { data } = vi.mocked(prisma.project.update).mock.calls[0][0]
		expect(data.heroEyebrow).toBe("Food and symptom journal")
		expect(data.plans).toBeUndefined()
		expect(data.palette).toBeUndefined()
	})

	it("passes a cleared product-page field through as null", async () => {
		vi.mocked(prisma.project.update).mockResolvedValue(existingProject)
		await PUT(putRequest("1", { heroEyebrow: null }), params("1"))

		const { data } = vi.mocked(prisma.project.update).mock.calls[0][0]
		expect(data.heroEyebrow).toBeNull()
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

	it("emits an info-level audit log on successful update", async () => {
		// `previousSlug` stays null: the slug can't change on update, so the
		// field only ever carries a value on the post routes.
		vi.mocked(prisma.project.update).mockResolvedValue({
			...existingProject,
			name: "New Name",
		})

		await PUT(putRequest("1", { name: "New Name" }), params("1"))

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:projects:PUT] success",
			{
				id: existingProject.id,
				slug: "my-app",
				section: null,
				sortOrder: existingProject.sortOrder,
				previousSection: null,
				previousSlug: null,
				batchId: null,
			}
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
						findUnique: vi.mocked(prisma.project.findUnique),
						delete: vi.mocked(prisma.project.delete),
						updateMany: vi.mocked(prisma.project.updateMany),
					},
					guide: { count: vi.mocked(prisma.guide.count) },
					guideTopic: { count: vi.mocked(prisma.guideTopic.count) },
				} as unknown as Prisma.TransactionClient)
		)
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject)
		vi.mocked(prisma.guide.count).mockResolvedValue(0)
		vi.mocked(prisma.guideTopic.count).mockResolvedValue(0)
	})

	it("counts guides and topics by the project's slug", async () => {
		vi.mocked(prisma.project.delete).mockResolvedValue(existingProject)

		await DELETE(new Request("http://localhost"), params("1"))

		expect(prisma.guide.count).toHaveBeenCalledWith({
			where: { projectSlug: "my-app" },
		})
		expect(prisma.guideTopic.count).toHaveBeenCalledWith({
			where: { projectSlug: "my-app" },
		})
	})

	it("returns 409 and deletes nothing while guides or topics still name the project", async () => {
		vi.mocked(prisma.guide.count).mockResolvedValue(2)
		vi.mocked(prisma.guideTopic.count).mockResolvedValue(1)

		const response = await DELETE(new Request("http://localhost"), params("1"))

		expect(response.status).toBe(409)
		const data = await response.json()
		expect(data.error).toBe(
			"This project still has 2 guides and 1 topic. Move them to another project or clear their project first."
		)
		expect(prisma.project.delete).not.toHaveBeenCalled()
		expect(prisma.project.updateMany).not.toHaveBeenCalled()
		expect(vi.mocked(revalidateTag)).not.toHaveBeenCalled()
		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[api:admin:projects:DELETE] project still referenced",
			{ id: 1, guides: 2, topics: 1 }
		)
	})

	it.each([
		[1, 0, "This project still has 1 guide."],
		[0, 3, "This project still has 3 topics."],
	])(
		"names only the kinds that still reference it (%i guides, %i topics)",
		async (guides, topics, lead) => {
			vi.mocked(prisma.guide.count).mockResolvedValue(guides)
			vi.mocked(prisma.guideTopic.count).mockResolvedValue(topics)

			const response = await DELETE(
				new Request("http://localhost"),
				params("1")
			)

			const data = await response.json()
			expect(data.error.startsWith(lead)).toBe(true)
		}
	)

	it("reaches the delete, and its 404, when the project doesn't exist", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(null)
		vi.mocked(isPrismaNotFound).mockReturnValue(true)
		vi.mocked(prisma.project.delete).mockRejectedValue({ code: "P2025" })

		const response = await DELETE(new Request("http://localhost"), params("1"))

		expect(response.status).toBe(404)
		expect(prisma.guide.count).not.toHaveBeenCalled()
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
