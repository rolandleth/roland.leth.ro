import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	isPrismaForeignKeyConstraint,
	isPrismaNotFound,
	prisma,
} from "@/lib/db/db"
import { revalidateGuideTopic } from "@/lib/db/guides"
import {
	describeTopicRefProblem,
	findSlugOwner,
} from "@/lib/db/guideValidation"
import { DELETE, GET, PUT } from "./route"

vi.mock("@/lib/api/requireAdmin", async () => {
	const { requireAdminMockFactory } = await import("@/test/mocks/requireAdmin")

	return requireAdminMockFactory()
})

// The PUT runs inside `$transaction`; the mock hands the callback a `tx` with
// the same shape so the cascade path is exercised rather than stubbed out.
const tx = {
	guideTopic: { findUnique: vi.fn(), update: vi.fn() },
	guide: { updateMany: vi.fn(), findMany: vi.fn() },
}

vi.mock("@/lib/db/db", () => ({
	prisma: {
		guideTopic: { delete: vi.fn(), findUnique: vi.fn() },
		$transaction: vi.fn(),
	},
	isPrismaUniqueConstraint: vi.fn().mockReturnValue(false),
	isPrismaForeignKeyConstraint: vi.fn().mockReturnValue(false),
	isPrismaNotFound: vi.fn().mockReturnValue(false),
}))

vi.mock("@/lib/db/guides", () => ({ revalidateGuideTopic: vi.fn() }))

vi.mock("@/lib/db/guideValidation", () => ({
	findSlugOwner: vi.fn(),
	describeTopicRefProblem: vi.fn(),
}))

function paramsFor(id: string) {
	return { params: Promise.resolve({ id }) }
}

function makeRequest(body: unknown) {
	return new Request("http://localhost/api/admin/guide-topics/1", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
}

const existing = {
	slug: "making-better-decisions",
	projectSlug: "reckon",
}

const updated = {
	id: 1,
	slug: "making-better-decisions",
	title: "Making better decisions",
	shortDescription: "S",
	description: "Hub body.",
	projectSlug: "reckon",
	published: true,
	createdAt: new Date(),
	updatedAt: new Date(),
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(findSlugOwner).mockResolvedValue(null)
	vi.mocked(describeTopicRefProblem).mockResolvedValue(null)
	tx.guideTopic.findUnique.mockResolvedValue(existing)
	tx.guideTopic.update.mockResolvedValue(updated)
	tx.guide.findMany.mockResolvedValue([
		{ slug: "guide-a" },
		{ slug: "guide-b" },
	])
	vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) =>
		(callback as (t: typeof tx) => Promise<unknown>)(tx)
	)
})

// #region PUT

describe("PUT /api/admin/guide-topics/[id]", () => {
	it("returns 404 when the topic does not exist", async () => {
		tx.guideTopic.findUnique.mockResolvedValue(null)

		const response = await PUT(makeRequest({ title: "x" }), paramsFor("1"))

		expect(response.status).toBe(404)
	})

	it("returns 409 when the new slug is taken by a guide", async () => {
		vi.mocked(findSlugOwner).mockResolvedValue("guide")

		const response = await PUT(makeRequest({ slug: "taken" }), paramsFor("1"))

		expect(response.status).toBe(409)
		expect(prisma.$transaction).not.toHaveBeenCalled()
	})

	it("returns 400 when the project doesn't exist", async () => {
		vi.mocked(describeTopicRefProblem).mockResolvedValue("Unknown project: x")

		const response = await PUT(
			makeRequest({ projectSlug: "ghost" }),
			paramsFor("1")
		)

		expect(response.status).toBe(400)
		expect(prisma.$transaction).not.toHaveBeenCalled()
	})

	it("busts the hub and every guide's parent link", async () => {
		await PUT(makeRequest({ title: "New title" }), paramsFor("1"))

		expect(revalidateGuideTopic).toHaveBeenCalledWith(
			"making-better-decisions",
			["guide-a", "guide-b"]
		)
	})

	it("busts the old hub URL too on a rename", async () => {
		tx.guideTopic.update.mockResolvedValue({ ...updated, slug: "new-slug" })

		await PUT(makeRequest({ slug: "new-slug" }), paramsFor("1"))

		expect(revalidateGuideTopic).toHaveBeenCalledWith("new-slug", [
			"guide-a",
			"guide-b",
		])
		expect(revalidateGuideTopic).toHaveBeenCalledWith("making-better-decisions")
	})

	// The invariant is enforced on every guide write, so a topic changing project
	// has to carry its guides with it or the rule becomes a lie.
	it("cascades a project change to the topic's guides", async () => {
		tx.guideTopic.update.mockResolvedValue({
			...updated,
			projectSlug: "continuum",
		})

		await PUT(makeRequest({ projectSlug: "continuum" }), paramsFor("1"))

		expect(tx.guide.updateMany).toHaveBeenCalledWith({
			where: { topicId: 1 },
			data: { projectSlug: "continuum" },
		})
	})

	it("does not cascade when the project is unchanged", async () => {
		await PUT(makeRequest({ projectSlug: "reckon" }), paramsFor("1"))

		expect(tx.guide.updateMany).not.toHaveBeenCalled()
	})

	it("does not cascade when the project isn't in the payload at all", async () => {
		await PUT(makeRequest({ title: "New title" }), paramsFor("1"))

		expect(tx.guide.updateMany).not.toHaveBeenCalled()
	})

	it("cascades a topic being detached from its project", async () => {
		tx.guideTopic.update.mockResolvedValue({ ...updated, projectSlug: null })

		await PUT(makeRequest({ projectSlug: null }), paramsFor("1"))

		expect(tx.guide.updateMany).toHaveBeenCalledWith({
			where: { topicId: 1 },
			data: { projectSlug: null },
		})
	})
})

// #endregion

// #region DELETE

describe("DELETE /api/admin/guide-topics/[id]", () => {
	it("returns 204 and busts the hub on success", async () => {
		vi.mocked(prisma.guideTopic.delete).mockResolvedValue(updated)

		const response = await DELETE(
			new Request("http://localhost", { method: "DELETE" }),
			paramsFor("1")
		)

		expect(response.status).toBe(204)
		expect(revalidateGuideTopic).toHaveBeenCalledWith("making-better-decisions")
	})

	// `Restrict` is the designed behaviour — surface it as an actionable 409, not
	// a 500 that reads like a bug.
	it("returns 409 with an actionable message when the topic still has guides", async () => {
		vi.mocked(prisma.guideTopic.delete).mockRejectedValue(
			Object.assign(new Error("FK"), { code: "P2003" })
		)
		vi.mocked(isPrismaForeignKeyConstraint).mockReturnValue(true)

		const response = await DELETE(
			new Request("http://localhost", { method: "DELETE" }),
			paramsFor("1")
		)

		expect(response.status).toBe(409)
		expect((await response.json()).error).toContain("still has guides")
	})

	// A delete of an already-gone row (P2025) is a 404, not a 500.
	it("returns 404 when the topic no longer exists", async () => {
		vi.mocked(prisma.guideTopic.delete).mockRejectedValue(
			Object.assign(new Error("not found"), { code: "P2025" })
		)
		vi.mocked(isPrismaNotFound).mockReturnValue(true)

		const response = await DELETE(
			new Request("http://localhost", { method: "DELETE" }),
			paramsFor("1")
		)

		expect(response.status).toBe(404)
	})
})

// #endregion

// #region GET

describe("GET /api/admin/guide-topics/[id]", () => {
	it("returns the topic when it exists", async () => {
		vi.mocked(prisma.guideTopic.findUnique).mockResolvedValue(updated)

		const response = await GET(new Request("http://localhost"), paramsFor("1"))

		expect(response.status).toBe(200)
		expect((await response.json()).slug).toBe("making-better-decisions")
	})

	it("returns 404 when the topic does not exist", async () => {
		vi.mocked(prisma.guideTopic.findUnique).mockResolvedValue(null)

		const response = await GET(
			new Request("http://localhost"),
			paramsFor("999")
		)

		expect(response.status).toBe(404)
	})

	it("returns 400 for a non-numeric id", async () => {
		const response = await GET(
			new Request("http://localhost"),
			paramsFor("abc")
		)

		expect(response.status).toBe(400)
	})
})

// #endregion
