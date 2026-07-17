import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/db"
import {
	describeGuideRefProblem,
	describeTopicRefProblem,
	findSlugOwner,
} from "@/lib/db/guideValidation"

vi.mock("@/lib/db/db", () => ({
	prisma: {
		guide: { findUnique: vi.fn() },
		guideTopic: { findUnique: vi.fn() },
		project: { findUnique: vi.fn() },
	},
}))

beforeEach(() => {
	vi.resetAllMocks()
})

// #region findSlugOwner

describe("findSlugOwner", () => {
	function mockOwners(guide: number | null, topic: number | null) {
		vi.mocked(prisma.guide.findUnique).mockResolvedValue(
			guide == null ? null : ({ id: guide } as never)
		)
		vi.mocked(prisma.guideTopic.findUnique).mockResolvedValue(
			topic == null ? null : ({ id: topic } as never)
		)
	}

	it("returns null when the slug is free in both tables", async () => {
		mockOwners(null, null)

		expect(await findSlugOwner("free")).toBeNull()
	})

	it("reports a guide holding the slug", async () => {
		mockOwners(1, null)

		expect(await findSlugOwner("taken")).toBe("guide")
	})

	it("reports a topic holding the slug", async () => {
		mockOwners(null, 2)

		expect(await findSlugOwner("taken")).toBe("topic")
	})

	it("ignores the guide being updated so re-saving its own slug is free", async () => {
		mockOwners(1, null)

		expect(await findSlugOwner("taken", { kind: "guide", id: 1 })).toBeNull()
	})

	it("ignores the topic being updated so re-saving its own slug is free", async () => {
		mockOwners(null, 2)

		expect(await findSlugOwner("taken", { kind: "topic", id: 2 })).toBeNull()
	})

	it("still reports a conflict when a different guide holds the slug", async () => {
		mockOwners(1, null)

		expect(await findSlugOwner("taken", { kind: "guide", id: 99 })).toBe(
			"guide"
		)
	})

	// The cross-table case Postgres can't express: a guide can't take a topic's
	// slug just because it lives in a different table.
	it("reports the topic when a guide update collides with a topic's slug", async () => {
		mockOwners(null, 2)

		expect(await findSlugOwner("taken", { kind: "guide", id: 1 })).toBe("topic")
	})
})

// #endregion

// #region describeGuideRefProblem

describe("describeGuideRefProblem", () => {
	function mockRefs({
		project,
		topicProjectSlug,
	}: {
		project?: boolean
		topicProjectSlug?: string | null | "missing"
	}) {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(
			project === true ? ({ slug: "reckon" } as never) : null
		)
		vi.mocked(prisma.guideTopic.findUnique).mockResolvedValue(
			topicProjectSlug === "missing" || topicProjectSlug === undefined
				? null
				: ({ projectSlug: topicProjectSlug } as never)
		)
	}

	it("accepts a guide with no project and no topic", async () => {
		expect(
			await describeGuideRefProblem({ projectSlug: null, topicId: null })
		).toBeNull()
	})

	it("accepts a guide whose project exists and has no topic", async () => {
		mockRefs({ project: true })

		expect(
			await describeGuideRefProblem({ projectSlug: "reckon", topicId: null })
		).toBeNull()
	})

	// `projectSlug` is a slug reference, not an FK, so nothing else catches this.
	it("rejects an unknown project", async () => {
		mockRefs({ project: false })

		expect(
			await describeGuideRefProblem({ projectSlug: "ghost", topicId: null })
		).toBe("Unknown project: ghost")
	})

	it("rejects an unknown topic", async () => {
		mockRefs({ project: true, topicProjectSlug: "missing" })

		expect(
			await describeGuideRefProblem({ projectSlug: "reckon", topicId: 7 })
		).toBe("Unknown topic: 7")
	})

	it("accepts a guide whose project matches its topic's", async () => {
		mockRefs({ project: true, topicProjectSlug: "reckon" })

		expect(
			await describeGuideRefProblem({ projectSlug: "reckon", topicId: 7 })
		).toBeNull()
	})

	it("accepts a projectless guide under a projectless topic", async () => {
		mockRefs({ topicProjectSlug: null })

		expect(
			await describeGuideRefProblem({ projectSlug: null, topicId: 7 })
		).toBeNull()
	})

	// Otherwise a Reckon guide could sit under a Continuum hub and be listed on
	// both products' pages.
	it("rejects a guide whose project disagrees with its topic's", async () => {
		mockRefs({ project: true, topicProjectSlug: "continuum" })

		expect(
			await describeGuideRefProblem({ projectSlug: "reckon", topicId: 7 })
		).toBe(
			"A guide's project (reckon) must match its topic's project (continuum)"
		)
	})

	it("rejects a projectless guide under a project's topic", async () => {
		mockRefs({ topicProjectSlug: "reckon" })

		expect(
			await describeGuideRefProblem({ projectSlug: null, topicId: 7 })
		).toBe("A guide's project (none) must match its topic's project (reckon)")
	})

	it("rejects a project's guide under a projectless topic", async () => {
		mockRefs({ project: true, topicProjectSlug: null })

		expect(
			await describeGuideRefProblem({ projectSlug: "reckon", topicId: 7 })
		).toBe("A guide's project (reckon) must match its topic's project (none)")
	})

	it("does not query for a project when the guide has none", async () => {
		mockRefs({})

		await describeGuideRefProblem({ projectSlug: null, topicId: null })

		expect(prisma.project.findUnique).not.toHaveBeenCalled()
	})
})

// #endregion

// #region describeTopicRefProblem

describe("describeTopicRefProblem", () => {
	it("accepts a topic with no project", async () => {
		expect(await describeTopicRefProblem({ projectSlug: null })).toBeNull()
		expect(prisma.project.findUnique).not.toHaveBeenCalled()
	})

	it("accepts a topic whose project exists", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue({
			slug: "reckon",
		} as never)

		expect(await describeTopicRefProblem({ projectSlug: "reckon" })).toBeNull()
	})

	it("rejects an unknown project", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

		expect(await describeTopicRefProblem({ projectSlug: "ghost" })).toBe(
			"Unknown project: ghost"
		)
	})
})

// #endregion
