import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/db"
import { revalidateTopicsById } from "@/lib/db/guideRevalidation"
import { revalidateGuide } from "@/lib/db/guides"
import {
	describeGuideRefProblem,
	findSlugOwner,
} from "@/lib/db/guideValidation"
import { POST } from "./route"

vi.mock("@/lib/db/db", () => ({
	prisma: { guide: { create: vi.fn() } },
	isPrismaUniqueConstraint: vi.fn().mockReturnValue(false),
}))

vi.mock("@/lib/db/guides", () => ({ revalidateGuide: vi.fn() }))

vi.mock("@/lib/db/guideRevalidation", () => ({
	revalidateTopicsById: vi.fn(),
}))

vi.mock("@/lib/db/guideValidation", () => ({
	findSlugOwner: vi.fn(),
	describeGuideRefProblem: vi.fn(),
}))

function makeRequest(body: unknown) {
	return new Request("http://localhost/api/admin/guides", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
}

const validPayload = {
	slug: "how-to-keep-a-decision-journal",
	title: "How to keep a decision journal",
	description: "What to write down before an outcome exists.",
	body: "Body content.",
}

const createdGuide = {
	id: 1,
	...validPayload,
	projectSlug: null,
	topicId: null,
	sortOrder: 0,
	published: true,
	publishedAt: new Date(),
	readingTime: "1 min read",
	createdAt: new Date(),
	updatedAt: new Date(),
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(findSlugOwner).mockResolvedValue(null)
	vi.mocked(describeGuideRefProblem).mockResolvedValue(null)
})

describe("POST /api/admin/guides", () => {
	it("returns 201 with the created guide on a valid payload", async () => {
		vi.mocked(prisma.guide.create).mockResolvedValue(createdGuide)

		const response = await POST(makeRequest(validPayload))

		expect(response.status).toBe(201)
		expect((await response.json()).id).toBe(1)
	})

	it("rejects a payload with no slug — a guide's slug is authored, never derived", async () => {
		const { slug, ...withoutSlug } = validPayload
		expect(slug).toBeDefined()

		const response = await POST(makeRequest(withoutSlug))

		expect(response.status).toBe(400)
		expect(prisma.guide.create).not.toHaveBeenCalled()
	})

	it("rejects a non-canonical slug rather than normalizing it", async () => {
		const response = await POST(
			makeRequest({ ...validPayload, slug: "Not Canonical" })
		)

		expect(response.status).toBe(400)
		expect(prisma.guide.create).not.toHaveBeenCalled()
	})

	it("derives reading time from the body", async () => {
		vi.mocked(prisma.guide.create).mockResolvedValue(createdGuide)

		// Long enough to clear `calculateReadingTime`'s sub-15-second floor, which
		// returns "" — the short fixture body above would assert nothing.
		await POST(makeRequest({ ...validPayload, body: "word ".repeat(500) }))

		const { data } = vi.mocked(prisma.guide.create).mock.calls[0][0] as {
			data: { readingTime: string }
		}
		expect(data.readingTime).toMatch(/min read/)
	})

	it("stamps publishedAt when the guide is created published", async () => {
		vi.mocked(prisma.guide.create).mockResolvedValue(createdGuide)

		await POST(makeRequest(validPayload))

		const { data } = vi.mocked(prisma.guide.create).mock.calls[0][0] as {
			data: { publishedAt?: Date }
		}
		expect(data.publishedAt).toBeInstanceOf(Date)
	})

	it("leaves publishedAt unset when the guide is created as a draft", async () => {
		vi.mocked(prisma.guide.create).mockResolvedValue(createdGuide)

		await POST(makeRequest({ ...validPayload, published: false }))

		const { data } = vi.mocked(prisma.guide.create).mock.calls[0][0] as {
			data: { publishedAt?: Date }
		}
		expect(data.publishedAt).toBeUndefined()
	})

	// The DB's per-table unique can't see that a topic already owns this URL.
	it("returns 409 when a topic already owns the slug", async () => {
		vi.mocked(findSlugOwner).mockResolvedValue("topic")

		const response = await POST(makeRequest(validPayload))

		expect(response.status).toBe(409)
		expect((await response.json()).error).toContain("topic")
		expect(prisma.guide.create).not.toHaveBeenCalled()
	})

	it("returns 409 when another guide already owns the slug", async () => {
		vi.mocked(findSlugOwner).mockResolvedValue("guide")

		const response = await POST(makeRequest(validPayload))

		expect(response.status).toBe(409)
		expect(prisma.guide.create).not.toHaveBeenCalled()
	})

	it("returns 400 with the reference problem when refs don't validate", async () => {
		vi.mocked(describeGuideRefProblem).mockResolvedValue("Unknown project: x")

		const response = await POST(makeRequest(validPayload))

		expect(response.status).toBe(400)
		expect((await response.json()).error).toBe("Unknown project: x")
		expect(prisma.guide.create).not.toHaveBeenCalled()
	})

	it("busts the guide's page and its hub's list on success", async () => {
		vi.mocked(prisma.guide.create).mockResolvedValue({
			...createdGuide,
			topicId: 7,
		})

		await POST(makeRequest({ ...validPayload, topicId: 7 }))

		expect(revalidateGuide).toHaveBeenCalledWith(
			"how-to-keep-a-decision-journal"
		)
		expect(revalidateTopicsById).toHaveBeenCalledWith([7])
	})
})
