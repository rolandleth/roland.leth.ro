import { beforeEach, describe, expect, it, vi } from "vitest"
import { isPrismaUniqueConstraint, prisma } from "@/lib/db/db"
import { revalidateGuideTopic } from "@/lib/db/guides"
import {
	describeTopicRefProblem,
	findSlugOwner,
} from "@/lib/db/guideValidation"
import { POST } from "./route"

vi.mock("@/lib/db/db", () => ({
	prisma: { guideTopic: { create: vi.fn() } },
	isPrismaUniqueConstraint: vi.fn().mockReturnValue(false),
}))

vi.mock("@/lib/db/guides", () => ({ revalidateGuideTopic: vi.fn() }))

vi.mock("@/lib/db/guideValidation", () => ({
	findSlugOwner: vi.fn(),
	describeTopicRefProblem: vi.fn(),
}))

function makeRequest(body: unknown) {
	return new Request("http://localhost/api/admin/guide-topics", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
}

const validPayload = {
	slug: "making-better-decisions",
	title: "Making better decisions",
	shortDescription: "A method for judging your own calls honestly.",
	description: "Hub body.",
}

const created = {
	id: 1,
	...validPayload,
	projectSlug: null,
	published: true,
	createdAt: new Date(),
	updatedAt: new Date(),
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(findSlugOwner).mockResolvedValue(null)
	vi.mocked(describeTopicRefProblem).mockResolvedValue(null)
})

describe("POST /api/admin/guide-topics", () => {
	it("returns 201 with the created topic on a valid payload", async () => {
		vi.mocked(prisma.guideTopic.create).mockResolvedValue(created)

		const response = await POST(makeRequest(validPayload))

		expect(response.status).toBe(201)
		expect((await response.json()).id).toBe(1)
	})

	it("requires a hub body", async () => {
		const response = await POST(
			makeRequest({ ...validPayload, description: "" })
		)

		expect(response.status).toBe(400)
		expect(prisma.guideTopic.create).not.toHaveBeenCalled()
	})

	// The flat namespace is shared across both tables.
	it("returns 409 when a guide already owns the slug", async () => {
		vi.mocked(findSlugOwner).mockResolvedValue("guide")

		const response = await POST(makeRequest(validPayload))

		expect(response.status).toBe(409)
		expect((await response.json()).error).toContain("guide")
		expect(prisma.guideTopic.create).not.toHaveBeenCalled()
	})

	it("returns 400 when the named project doesn't exist", async () => {
		vi.mocked(describeTopicRefProblem).mockResolvedValue("Unknown project: x")

		const response = await POST(
			makeRequest({ ...validPayload, projectSlug: "ghost" })
		)

		expect(response.status).toBe(400)
		expect(prisma.guideTopic.create).not.toHaveBeenCalled()
	})

	// `findSlugOwner` is racy; the per-table constraint holds the line when a
	// concurrent insert wins between the check and the create — map P2002 to 409.
	it("maps a lost slug race (unique constraint on create) to 409", async () => {
		vi.mocked(isPrismaUniqueConstraint).mockReturnValue(true)
		vi.mocked(prisma.guideTopic.create).mockRejectedValue(new Error("P2002"))

		const response = await POST(makeRequest(validPayload))

		expect(response.status).toBe(409)
	})

	it("busts the new hub's page", async () => {
		vi.mocked(prisma.guideTopic.create).mockResolvedValue(created)

		await POST(makeRequest(validPayload))

		expect(revalidateGuideTopic).toHaveBeenCalledWith("making-better-decisions")
	})

	it("defaults to published", async () => {
		vi.mocked(prisma.guideTopic.create).mockResolvedValue(created)

		await POST(makeRequest(validPayload))

		const { data } = vi.mocked(prisma.guideTopic.create).mock.calls[0][0] as {
			data: { published: boolean }
		}
		expect(data.published).toBe(true)
	})
})
