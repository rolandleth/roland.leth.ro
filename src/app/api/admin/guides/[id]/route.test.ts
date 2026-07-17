import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/db"
import { revalidateTopicsById } from "@/lib/db/guideRevalidation"
import { revalidateGuide } from "@/lib/db/guides"
import {
	describeGuideRefProblem,
	findSlugOwner,
} from "@/lib/db/guideValidation"
import { DELETE, PUT } from "./route"

vi.mock("@/lib/db/db", () => ({
	prisma: {
		guide: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
	},
	isPrismaUniqueConstraint: vi.fn().mockReturnValue(false),
	isPrismaNotFound: vi.fn().mockReturnValue(false),
}))

vi.mock("@/lib/db/guides", () => ({ revalidateGuide: vi.fn() }))

vi.mock("@/lib/db/guideRevalidation", () => ({ revalidateTopicsById: vi.fn() }))

vi.mock("@/lib/db/guideValidation", () => ({
	findSlugOwner: vi.fn(),
	describeGuideRefProblem: vi.fn(),
}))

function paramsFor(id: string) {
	return { params: Promise.resolve({ id }) }
}

function makeRequest(body: unknown) {
	return new Request("http://localhost/api/admin/guides/1", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
}

const existing = {
	id: 1,
	slug: "how-to-keep-a-decision-journal",
	title: "How to keep a decision journal",
	description: "D",
	body: "Body.",
	projectSlug: "reckon",
	topicId: 7,
	sortOrder: 0,
	published: true,
	publishedAt: new Date("2026-07-01T00:00:00.000Z"),
	readingTime: "6 min read",
	createdAt: new Date(),
	updatedAt: new Date(),
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(findSlugOwner).mockResolvedValue(null)
	vi.mocked(describeGuideRefProblem).mockResolvedValue(null)
	vi.mocked(prisma.guide.findUnique).mockResolvedValue(existing)
	vi.mocked(prisma.guide.update).mockResolvedValue(existing)
})

// #region PUT

describe("PUT /api/admin/guides/[id]", () => {
	it("returns 400 for a non-numeric id", async () => {
		const response = await PUT(makeRequest({ title: "x" }), paramsFor("abc"))

		expect(response.status).toBe(400)
	})

	it("returns 404 when the guide does not exist", async () => {
		vi.mocked(prisma.guide.findUnique).mockResolvedValue(null)

		const response = await PUT(makeRequest({ title: "x" }), paramsFor("1"))

		expect(response.status).toBe(404)
		expect(prisma.guide.update).not.toHaveBeenCalled()
	})

	it("accepts a partial update", async () => {
		const response = await PUT(
			makeRequest({ title: "New title" }),
			paramsFor("1")
		)

		expect(response.status).toBe(200)
	})

	it("does not check slug ownership when the slug isn't being changed", async () => {
		await PUT(makeRequest({ title: "New title" }), paramsFor("1"))

		expect(findSlugOwner).not.toHaveBeenCalled()
	})

	it("excludes itself from the slug check so re-saving its own slug is allowed", async () => {
		await PUT(makeRequest({ slug: "same-slug" }), paramsFor("1"))

		expect(findSlugOwner).toHaveBeenCalledWith("same-slug", {
			kind: "guide",
			id: 1,
		})
	})

	it("returns 409 when the new slug is taken by a topic", async () => {
		vi.mocked(findSlugOwner).mockResolvedValue("topic")

		const response = await PUT(makeRequest({ slug: "taken" }), paramsFor("1"))

		expect(response.status).toBe(409)
		expect(prisma.guide.update).not.toHaveBeenCalled()
	})

	// The gap this closes: a PUT that patches only `topicId` must still cohere
	// with the project already on the row, not skip the check.
	it("validates refs against the persisted project when only the topic is patched", async () => {
		await PUT(makeRequest({ topicId: 9 }), paramsFor("1"))

		expect(describeGuideRefProblem).toHaveBeenCalledWith({
			projectSlug: "reckon",
			topicId: 9,
		})
	})

	it("validates refs against the persisted topic when only the project is patched", async () => {
		await PUT(makeRequest({ projectSlug: "continuum" }), paramsFor("1"))

		expect(describeGuideRefProblem).toHaveBeenCalledWith({
			projectSlug: "continuum",
			topicId: 7,
		})
	})

	it("treats an explicit null as a value, not an absent field", async () => {
		await PUT(makeRequest({ topicId: null }), paramsFor("1"))

		expect(describeGuideRefProblem).toHaveBeenCalledWith({
			projectSlug: "reckon",
			topicId: null,
		})
	})

	it("returns 400 with the reference problem when refs don't validate", async () => {
		vi.mocked(describeGuideRefProblem).mockResolvedValue("mismatch")

		const response = await PUT(makeRequest({ topicId: 9 }), paramsFor("1"))

		expect(response.status).toBe(400)
		expect((await response.json()).error).toBe("mismatch")
		expect(prisma.guide.update).not.toHaveBeenCalled()
	})

	it("recomputes reading time when the body changes", async () => {
		await PUT(makeRequest({ body: "word ".repeat(500) }), paramsFor("1"))

		const { data } = vi.mocked(prisma.guide.update).mock.calls[0][0] as {
			data: { readingTime?: string }
		}
		expect(data.readingTime).toMatch(/min read/)
	})

	it("leaves reading time alone when the body isn't touched", async () => {
		await PUT(makeRequest({ title: "New title" }), paramsFor("1"))

		const { data } = vi.mocked(prisma.guide.update).mock.calls[0][0] as {
			data: { readingTime?: string }
		}
		expect(data.readingTime).toBeUndefined()
	})

	// An unpublish/republish cycle must not reset the page's age for crawlers.
	it("does not restamp publishedAt on republish", async () => {
		await PUT(makeRequest({ published: true }), paramsFor("1"))

		const { data } = vi.mocked(prisma.guide.update).mock.calls[0][0] as {
			data: { publishedAt?: Date }
		}
		expect(data.publishedAt).toBeUndefined()
	})

	it("stamps publishedAt on a never-published guide's first publish", async () => {
		vi.mocked(prisma.guide.findUnique).mockResolvedValue({
			...existing,
			publishedAt: null,
		})

		await PUT(makeRequest({ published: true }), paramsFor("1"))

		const { data } = vi.mocked(prisma.guide.update).mock.calls[0][0] as {
			data: { publishedAt?: Date }
		}
		expect(data.publishedAt).toBeInstanceOf(Date)
	})

	it("busts both the old and new URL on a rename", async () => {
		vi.mocked(prisma.guide.update).mockResolvedValue({
			...existing,
			slug: "new-slug",
		})

		await PUT(makeRequest({ slug: "new-slug" }), paramsFor("1"))

		expect(revalidateGuide).toHaveBeenCalledWith("new-slug")
		expect(revalidateGuide).toHaveBeenCalledWith(
			"how-to-keep-a-decision-journal"
		)
	})

	it("busts both hubs when a guide moves between topics", async () => {
		vi.mocked(prisma.guide.update).mockResolvedValue({
			...existing,
			topicId: 9,
		})

		await PUT(makeRequest({ topicId: 9 }), paramsFor("1"))

		expect(revalidateTopicsById).toHaveBeenCalledWith([7, 9])
	})
})

// #endregion

// #region DELETE

describe("DELETE /api/admin/guides/[id]", () => {
	it("returns 204 and busts the guide's page and hub", async () => {
		vi.mocked(prisma.guide.delete).mockResolvedValue(existing)

		const response = await DELETE(
			new Request("http://localhost", { method: "DELETE" }),
			paramsFor("1")
		)

		expect(response.status).toBe(204)
		expect(revalidateGuide).toHaveBeenCalledWith(
			"how-to-keep-a-decision-journal"
		)
		expect(revalidateTopicsById).toHaveBeenCalledWith([7])
	})

	it("returns 400 for a non-numeric id", async () => {
		const response = await DELETE(
			new Request("http://localhost", { method: "DELETE" }),
			paramsFor("abc")
		)

		expect(response.status).toBe(400)
		expect(prisma.guide.delete).not.toHaveBeenCalled()
	})
})

// #endregion
