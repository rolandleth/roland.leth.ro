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

	it("skips a file whose title sanitizes to an empty slug", async () => {
		// Parser accepts `!!!` as a title; `createSlug("!!!")` returns "" because
		// every char is in the punctuation-strip class. Route must surface this
		// as a skip rather than attempting an empty-slug insert.
		const response = await POST(
			makeRequest({
				section: "tech",
				files: [{ filename: "2026-05-15-!!!.md", content: "body" }],
			})
		)

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.created).toBe(0)
		expect(data.skipped).toEqual([
			{
				filename: "2026-05-15-!!!.md",
				reason: expect.stringMatching(/empty slug/i),
			},
		])
		expect(prisma.post.createManyAndReturn).not.toHaveBeenCalled()
	})

	it("scopes uniqueness to (section, slug) so the same slug succeeds in tech and life independently", async () => {
		// Two batches: one tech, one life, both posting the same slug. Both must
		// succeed independently — the findMany pre-query filters by section, and
		// the DB unique constraint is also `(section, slug)`. A scope-narrowing
		// regression here would silently start cross-section-blocking writes.
		vi.mocked(prisma.post.findMany).mockResolvedValueOnce([])
		vi.mocked(prisma.post.createManyAndReturn).mockResolvedValueOnce([
			{ id: 1, slug: "shared", section: "tech" } as never,
		])
		const tech = await POST(
			makeRequest({
				section: "tech",
				files: [{ filename: "2026-05-15-Shared.md", content: "t" }],
			})
		)
		expect((await tech.json()).created).toBe(1)

		vi.mocked(prisma.post.findMany).mockResolvedValueOnce([])
		vi.mocked(prisma.post.createManyAndReturn).mockResolvedValueOnce([
			{ id: 2, slug: "shared", section: "life" } as never,
		])
		const life = await POST(
			makeRequest({
				section: "life",
				files: [{ filename: "2026-05-15-Shared.md", content: "l" }],
			})
		)
		expect((await life.json()).created).toBe(1)

		// Both findMany calls must filter by their own section, not the other's.
		const findManyCalls = vi.mocked(prisma.post.findMany).mock.calls
		expect(findManyCalls[0][0]?.where).toMatchObject({ section: "tech" })
		expect(findManyCalls[1][0]?.where).toMatchObject({ section: "life" })
	})

	it("reconciles a concurrent insert race: rows dropped by skipDuplicates are surfaced in `skipped`", async () => {
		// 2026-05-16 review: previously the route reported `created: <returned>`
		// without telling the admin which filename was eaten by the
		// `skipDuplicates` belt-and-suspenders. This pins that a dropped row
		// surfaces in `skipped` with a discoverable reason.
		vi.mocked(prisma.post.findMany).mockResolvedValue([])
		// Two files prepared, only one returned by createManyAndReturn — the
		// "loser" row was concurrent-inserted by another writer between the
		// pre-query and the bulk insert.
		vi.mocked(prisma.post.createManyAndReturn).mockResolvedValue([
			{ id: 1, slug: "winner", section: "tech" } as never,
		])

		const response = await POST(
			makeRequest({
				section: "tech",
				files: [
					{ filename: "2026-05-15-Winner.md", content: "w" },
					{ filename: "2026-05-15-Loser.md", content: "l" },
				],
			})
		)

		const data = await response.json()
		expect(data.created).toBe(1)
		expect(data.skipped).toEqual([
			{
				filename: "2026-05-15-Loser.md",
				reason: expect.stringMatching(/concurrent/i),
			},
		])
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

	it("does NOT revalidate or emit audit lines on a zero-create batch", async () => {
		// Whether the zero-create comes from a parse-time skip or a DB-time
		// skip, neither `revalidateTag` nor any `[api:admin:posts:BULK] success`
		// audit line should fire. Pins the no-op invariant against accidental
		// re-ordering of calls.
		const response = await POST(
			makeRequest({
				section: "tech",
				files: [{ filename: "garbage.md", content: "body" }],
			})
		)

		expect(response.status).toBe(200)
		expect(revalidateTag).not.toHaveBeenCalled()
		const auditCalls = vi
			.mocked(console.info)
			.mock.calls.filter((c) => c[0] === "[api:admin:posts:BULK] success")
		expect(auditCalls).toEqual([])
	})

	it("derives summary from the file content on every inserted row", async () => {
		// Bulk import has no per-file summary input — every created row must
		// carry an auto-derived summary so the OG meta description and feed
		// `<summary>` are never blank. Pins the contract against accidental
		// reintroduction of null summaries.
		await POST(
			makeRequest({
				section: "tech",
				files: [
					{
						filename: "2026-05-15-First.md",
						content: "First post body.",
					},
					{
						filename: "2026-05-16-Second.md",
						content: "Second post body.",
					},
				],
			})
		)

		const insertCall = vi.mocked(prisma.post.createManyAndReturn).mock
			.calls[0]?.[0]
		const data = insertCall?.data as Array<{ summary: string }>
		expect(data[0].summary).toBe("First post body.")
		expect(data[1].summary).toBe("Second post body.")
	})

	it("emits a skip-reason summary log when files are skipped", async () => {
		await POST(
			makeRequest({
				section: "tech",
				files: [
					{ filename: "garbage.md", content: "body" },
					{ filename: "2026-05-15-!!!.md", content: "body" },
				],
			})
		)

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:posts:BULK] skipped",
			expect.objectContaining({
				section: "tech",
				count: 2,
				reasonsByType: expect.any(Object),
			})
		)
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
