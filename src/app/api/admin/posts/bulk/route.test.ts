import { revalidateTag } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { currentDatetimeString } from "@/lib/format"
import { POST } from "./route"

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db", () => ({
	prisma: {
		post: {
			findMany: vi.fn().mockResolvedValue([]),
			createManyAndReturn: vi.fn().mockResolvedValue([]),
		},
	},
}))

// Pinned to a fixed past date so all parser-passing fixtures default to
// `published: false` under the auto rule. Future-dated cases override
// `currentDatetimeString` per-test.
vi.mock("@/lib/format", async () => {
	const actual =
		await vi.importActual<typeof import("@/lib/format")>("@/lib/format")
	return {
		...actual,
		currentDatetimeString: vi.fn().mockReturnValue("2099-01-01-0000"),
	}
})

function makeRequest(body: unknown) {
	return new Request("http://localhost/api/admin/posts/bulk", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
}

const validFile = {
	filename: "2026-05-15-1430-A real post.md",
	content: "Some markdown body.",
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(prisma.post.findMany).mockResolvedValue([])
	vi.mocked(prisma.post.createManyAndReturn).mockResolvedValue([
		{ id: 1, slug: "a-real-post", section: "tech" } as never,
	])
	// `vi.resetAllMocks()` clears the implementation set in the factory above,
	// so without restoring it here `currentDatetimeString()` returns `undefined`
	// and the auto-publish comparison degenerates.
	vi.mocked(currentDatetimeString).mockReturnValue("2099-01-01-0000")
})

// #region Schema gating

describe("POST /api/admin/posts/bulk schema", () => {
	it("returns 400 when section is missing", async () => {
		const response = await POST(makeRequest({ files: [validFile] }))
		expect(response.status).toBe(400)
	})

	it("returns 400 when section is unknown", async () => {
		const response = await POST(
			makeRequest({ section: "food", files: [validFile] })
		)
		expect(response.status).toBe(400)
	})

	it("returns 400 when files is empty", async () => {
		const response = await POST(makeRequest({ section: "tech", files: [] }))
		expect(response.status).toBe(400)
	})

	it("returns 400 when files exceeds the cap", async () => {
		const files = Array.from({ length: 51 }, (_, i) => ({
			filename: `2026-05-15-Title ${i}.md`,
			content: "body",
		}))
		const response = await POST(makeRequest({ section: "tech", files }))
		expect(response.status).toBe(400)
	})
})

// #endregion

// #region Per-file parsing + collisions

describe("POST /api/admin/posts/bulk per-file outcomes", () => {
	it("creates a valid file and returns counts", async () => {
		const response = await POST(
			makeRequest({ section: "tech", files: [validFile] })
		)

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.created).toBe(1)
		expect(data.skipped).toEqual([])
	})

	it("skips a malformed filename without aborting the batch", async () => {
		vi.mocked(prisma.post.createManyAndReturn).mockResolvedValue([
			{ id: 1, slug: "a-real-post", section: "tech" } as never,
		])

		const response = await POST(
			makeRequest({
				section: "tech",
				files: [validFile, { filename: "garbage.md", content: "body" }],
			})
		)

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.created).toBe(1)
		expect(data.skipped).toEqual([
			{ filename: "garbage.md", reason: expect.stringMatching(/yyyy-MM-dd/) },
		])
	})

	it("skips a slug that already exists in the same section", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			{ slug: "a-real-post" } as never,
		])
		vi.mocked(prisma.post.createManyAndReturn).mockResolvedValue([])

		const response = await POST(
			makeRequest({ section: "tech", files: [validFile] })
		)

		const data = await response.json()
		expect(data.created).toBe(0)
		expect(data.skipped).toEqual([
			{
				filename: validFile.filename,
				reason: expect.stringMatching(/already exists/i),
			},
		])
	})

	it("skips a duplicate slug within the same batch", async () => {
		vi.mocked(prisma.post.createManyAndReturn).mockResolvedValue([
			{ id: 1, slug: "duplicate-title", section: "tech" } as never,
		])

		const response = await POST(
			makeRequest({
				section: "tech",
				files: [
					{ filename: "2026-05-15-Duplicate Title.md", content: "a" },
					{ filename: "2026-05-16-Duplicate Title.md", content: "b" },
				],
			})
		)

		const data = await response.json()
		expect(data.created).toBe(1)
		expect(data.skipped).toEqual([
			{
				filename: "2026-05-16-Duplicate Title.md",
				reason: expect.stringMatching(/duplicate/i),
			},
		])
	})

	it("does not call createManyAndReturn when every file is skipped", async () => {
		const response = await POST(
			makeRequest({
				section: "tech",
				files: [{ filename: "garbage.md", content: "body" }],
			})
		)

		expect(response.status).toBe(200)
		expect(prisma.post.createManyAndReturn).not.toHaveBeenCalled()
	})
})

// #endregion

// #region Side effects

describe("POST /api/admin/posts/bulk side effects", () => {
	it("revalidates the section cache after a successful insert", async () => {
		await POST(makeRequest({ section: "life", files: [validFile] }))

		expect(revalidateTag).toHaveBeenCalledWith("blog-life", "max")
	})

	it("emits one audit line per created row", async () => {
		vi.mocked(prisma.post.createManyAndReturn).mockResolvedValue([
			{ id: 7, slug: "a-real-post", section: "tech" } as never,
			{ id: 8, slug: "another", section: "tech" } as never,
		])

		await POST(
			makeRequest({
				section: "tech",
				files: [validFile, { filename: "2026-06-01-Another.md", content: "x" }],
			})
		)

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:posts:BULK] success",
			expect.objectContaining({ id: 7, slug: "a-real-post" })
		)
		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:posts:BULK] success",
			expect.objectContaining({ id: 8, slug: "another" })
		)
	})

	it("returns 500 on an unexpected DB error", async () => {
		vi.mocked(prisma.post.findMany).mockRejectedValue(new Error("DB down"))

		const response = await POST(
			makeRequest({ section: "tech", files: [validFile] })
		)

		expect(response.status).toBe(500)
	})
})

// #endregion

// #region Auto-publish rule

describe("POST /api/admin/posts/bulk auto publish", () => {
	it("publishes a future-dated post and drafts a past-dated one", async () => {
		vi.mocked(prisma.post.createManyAndReturn).mockResolvedValue([
			{ id: 1, slug: "future", section: "tech" } as never,
			{ id: 2, slug: "past", section: "tech" } as never,
		])

		await POST(
			makeRequest({
				section: "tech",
				files: [
					{ filename: "2199-01-01-Future.md", content: "f" },
					{ filename: "2000-01-01-Past.md", content: "p" },
				],
			})
		)

		const args = vi.mocked(prisma.post.createManyAndReturn).mock.calls[0][0]
		const data = (args as { data: Array<{ slug: string; published: boolean }> })
			.data

		const future = data.find((d) => d.slug === "future")
		const past = data.find((d) => d.slug === "past")

		expect(future?.published).toBe(true)
		expect(past?.published).toBe(false)
	})
})

// #endregion
