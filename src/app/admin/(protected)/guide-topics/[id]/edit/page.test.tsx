import { beforeEach, describe, expect, it, vi } from "vitest"
import { verifySession } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/db"
import { getProjectsForAdmin } from "@/lib/db/projects"
import { generateMetadata, default as EditGuideTopicPage } from "./page"

vi.mock("@/lib/db/db", () => ({
	prisma: {
		guideTopic: { findUnique: vi.fn() },
		guide: { count: vi.fn() },
	},
}))

// `generateMetadata` guards its own DB read via `adminEditMetadata` — it runs
// outside `(protected)/layout.tsx`, so the real `verifySession` would reach for
// request-scoped cookies that don't exist here.
vi.mock("@/lib/auth/auth", () => ({
	verifySession: vi.fn(),
}))

vi.mock("@/lib/db/projects", () => ({
	getProjectsForAdmin: vi.fn(),
}))

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NOT_FOUND")
	}),
}))

vi.mock("@/components/admin/GuideTopicForm", () => ({
	default: function MockGuideTopicForm() {
		return null
	},
}))

function makeParams(id: string) {
	return { params: Promise.resolve({ id }) }
}

const existingTopic = {
	id: 1,
	slug: "my-topic",
	title: "My Topic",
	shortDescription: "One line",
	description: "Hub body",
	projectSlug: null,
	published: true,
	createdAt: new Date(),
	updatedAt: new Date(),
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(verifySession).mockResolvedValue(true)
	vi.mocked(getProjectsForAdmin).mockResolvedValue([])
	vi.mocked(prisma.guide.count).mockResolvedValue(0)
})

// #region generateMetadata

describe("generateMetadata", () => {
	it("returns 'Edit topic' for a non-numeric id", async () => {
		const result = await generateMetadata(makeParams("abc"))
		expect(result).toEqual({ title: "Edit topic" })
	})

	it("returns 'Edit topic' when the topic does not exist", async () => {
		vi.mocked(prisma.guideTopic.findUnique).mockResolvedValue(null)
		const result = await generateMetadata(makeParams("99"))
		expect(result).toEqual({ title: "Edit topic" })
	})

	it("returns 'Edit: {title}' when the topic exists", async () => {
		vi.mocked(prisma.guideTopic.findUnique).mockResolvedValue(existingTopic)
		const result = await generateMetadata(makeParams("1"))
		expect(result).toEqual({ title: "Edit: My Topic" })
	})

	it("does not query the db for a non-numeric id", async () => {
		await generateMetadata(makeParams("abc"))
		expect(vi.mocked(prisma.guideTopic.findUnique)).not.toHaveBeenCalled()
	})

	// The guard `adminEditMetadata` exists for. Covered on the helper too, but
	// pinned per page so a call site that forgets to route through it fails here.
	it("does not query the db without a valid session", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		const result = await generateMetadata(makeParams("1"))

		expect(result).toEqual({ title: "Edit topic" })
		expect(vi.mocked(prisma.guideTopic.findUnique)).not.toHaveBeenCalled()
	})

	it("logs the bypass with this page's tag", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)

		await generateMetadata(makeParams("1"))

		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining("[admin:guide-topics:edit]")
		)

		consoleError.mockRestore()
	})
})

// #endregion

// #region page body

describe("EditGuideTopicPage", () => {
	it("calls notFound for a non-numeric id", async () => {
		await expect(EditGuideTopicPage(makeParams("abc"))).rejects.toThrow(
			"NOT_FOUND"
		)
	})

	it("calls notFound when the topic does not exist", async () => {
		vi.mocked(prisma.guideTopic.findUnique).mockResolvedValue(null)
		await expect(EditGuideTopicPage(makeParams("99"))).rejects.toThrow(
			"NOT_FOUND"
		)
	})

	it("renders GuideTopicForm with the topic data", async () => {
		vi.mocked(prisma.guideTopic.findUnique).mockResolvedValue(existingTopic)
		const element = await EditGuideTopicPage(makeParams("1"))
		expect(element.props.initialData).toEqual(existingTopic)
	})

	// The count drives the delete affordance and the project-change cascade
	// warning, so a wrong scope here silently mislabels both.
	it("counts the topic's guides for the form", async () => {
		vi.mocked(prisma.guideTopic.findUnique).mockResolvedValue(existingTopic)
		vi.mocked(prisma.guide.count).mockResolvedValue(3)

		const element = await EditGuideTopicPage(makeParams("5"))

		expect(vi.mocked(prisma.guide.count)).toHaveBeenCalledWith({
			where: { topicId: 5 },
		})
		expect(element.props.guideCount).toBe(3)
	})
})

// #endregion
