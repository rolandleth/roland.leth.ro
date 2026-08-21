import { beforeEach, describe, expect, it, vi } from "vitest"
import { verifySession } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/db"
import { listGuideTopicOptions } from "@/lib/db/guides"
import { getProjectsForAdmin } from "@/lib/db/projects"
import { generateMetadata, default as EditGuidePage } from "./page"

vi.mock("@/lib/db/db", () => ({
	prisma: {
		guide: { findUnique: vi.fn() },
	},
}))

// `generateMetadata` guards its own DB read via `adminEditMetadata` — it runs
// outside `(protected)/layout.tsx`, so the real `verifySession` would reach for
// request-scoped cookies that don't exist here.
vi.mock("@/lib/auth/auth", () => ({
	verifySession: vi.fn(),
}))

// Partial mock: `loadGuideForAdmin` stays real so it exercises the mocked
// prisma above, while the two form-population queries are stubbed — neither is
// part of what this page's guard or lookup does.
vi.mock("@/lib/db/guides", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/db/guides")>()),
	listGuideTopicOptions: vi.fn(),
}))

vi.mock("@/lib/db/projects", () => ({
	getProjectsForAdmin: vi.fn(),
}))

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NOT_FOUND")
	}),
	redirect: vi.fn(() => {
		throw new Error("REDIRECT")
	}),
}))

vi.mock("@/components/admin/GuideForm", () => ({
	default: function MockGuideForm() {
		return null
	},
}))

function makeParams(id: string) {
	return { params: Promise.resolve({ id }) }
}

const existingGuide = {
	id: 1,
	slug: "my-guide",
	title: "My Guide",
	description: "What it covers",
	body: "Content",
	projectSlug: null,
	topicId: null,
	sortOrder: 0,
	readingTime: null,
	published: true,
	publishedAt: null,
	createdAt: new Date(),
	updatedAt: new Date(),
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(verifySession).mockResolvedValue(true)
	vi.mocked(listGuideTopicOptions).mockResolvedValue([])
	vi.mocked(getProjectsForAdmin).mockResolvedValue([])
})

// #region generateMetadata

describe("generateMetadata", () => {
	it("returns 'Edit guide' for a non-numeric id", async () => {
		const result = await generateMetadata(makeParams("abc"))
		expect(result).toEqual({ title: "Edit guide" })
	})

	it("returns 'Edit guide' when the guide does not exist", async () => {
		vi.mocked(prisma.guide.findUnique).mockResolvedValue(null)
		const result = await generateMetadata(makeParams("99"))
		expect(result).toEqual({ title: "Edit guide" })
	})

	it("returns 'Edit: {title}' when the guide exists", async () => {
		vi.mocked(prisma.guide.findUnique).mockResolvedValue(existingGuide)
		const result = await generateMetadata(makeParams("1"))
		expect(result).toEqual({ title: "Edit: My Guide" })
	})

	it("does not query the db for a non-numeric id", async () => {
		await generateMetadata(makeParams("abc"))
		expect(vi.mocked(prisma.guide.findUnique)).not.toHaveBeenCalled()
	})

	// The guard `adminEditMetadata` exists for. Covered on the helper too, but
	// pinned per page so a call site that forgets to route through it fails here.
	it("does not query the db without a valid session", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		const result = await generateMetadata(makeParams("1"))

		expect(result).toEqual({ title: "Edit guide" })
		expect(vi.mocked(prisma.guide.findUnique)).not.toHaveBeenCalled()
	})

	// `src/test/setup.ts` already swaps `console.error` for a `vi.fn()` per test,
	// so read that mock rather than layering a `vi.spyOn` on top of it.
	it("logs the bypass with this page's tag", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await generateMetadata(makeParams("1"))

		expect(vi.mocked(console.error)).toHaveBeenCalledWith(
			expect.stringContaining("[admin:guides:edit]"),
			expect.objectContaining({ surface: "generateMetadata", id: "1" })
		)
	})
})

// #endregion

// #region page body

describe("EditGuidePage", () => {
	it("calls notFound for a non-numeric id", async () => {
		await expect(EditGuidePage(makeParams("abc"))).rejects.toThrow("NOT_FOUND")
	})

	it("calls notFound when the guide does not exist", async () => {
		vi.mocked(prisma.guide.findUnique).mockResolvedValue(null)
		await expect(EditGuidePage(makeParams("99"))).rejects.toThrow("NOT_FOUND")
	})

	it("renders GuideForm with the guide data", async () => {
		vi.mocked(prisma.guide.findUnique).mockResolvedValue(existingGuide)
		const element = await EditGuidePage(makeParams("1"))
		expect(element.props.initialData).toEqual(existingGuide)
	})

	it("queries prisma with the correct id", async () => {
		vi.mocked(prisma.guide.findUnique).mockResolvedValue(existingGuide)
		await EditGuidePage(makeParams("5"))
		expect(vi.mocked(prisma.guide.findUnique)).toHaveBeenCalledWith({
			where: { id: 5 },
		})
	})

	// `generateMetadata`'s guard only affects the <title> — it does not stop
	// this body from rendering, since Next calls the two independently. These
	// three are what actually stop the row from reaching the client.
	it("redirects to login without a valid session", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(EditGuidePage(makeParams("1"))).rejects.toThrow("REDIRECT")
	})

	it("does not query the db without a valid session", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(EditGuidePage(makeParams("1"))).rejects.toThrow("REDIRECT")
		expect(vi.mocked(prisma.guide.findUnique)).not.toHaveBeenCalled()
	})

	it("logs the bypass under this page's tag with the page body surface", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(EditGuidePage(makeParams("1"))).rejects.toThrow("REDIRECT")

		expect(vi.mocked(console.error)).toHaveBeenCalledWith(
			expect.stringContaining("[admin:guides:edit]"),
			expect.objectContaining({ surface: "the page body" })
		)
	})
})

// #endregion
