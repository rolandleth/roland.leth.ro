import { revalidateTag } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/db"
import { buildPostFile } from "@/lib/import/frontmatter"
import { currentDatetimeString } from "@/lib/utils/format"
import { POST } from "./route"

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db/db", () => ({
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
vi.mock("@/lib/utils/format", async () => {
	const actual =
		await vi.importActual<typeof import("@/lib/utils/format")>(
			"@/lib/utils/format"
		)
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

/** A well-formed upload file: valid filename + frontmatter title + body. */
function file(filename: string, title: string, body: string) {
	return { filename, content: buildPostFile(title, body) }
}

const validFile = file(
	"2026-05-15-1430-a-real-post.md",
	"A real post",
	"Some markdown body."
)

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
		const files = Array.from({ length: 51 }, (_, i) =>
			file(`2026-05-15-title-${i}.md`, `Title ${i}`, "body")
		)
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
				files: [validFile, file("garbage.md", "Garbage", "body")],
			})
		)

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.created).toBe(1)
		expect(data.skipped).toEqual([
			{ filename: "garbage.md", reason: expect.stringMatching(/yyyy-MM-dd/) },
		])
	})

	it("skips a file with no frontmatter title", async () => {
		const response = await POST(
			makeRequest({
				section: "tech",
				files: [
					{
						filename: "2026-05-15-x.md",
						content: "Just a plain first line\n\nBody.",
					},
				],
			})
		)

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.created).toBe(0)
		expect(data.skipped).toEqual([
			{
				filename: "2026-05-15-x.md",
				reason: expect.stringMatching(/Missing `title:` frontmatter/),
			},
		])
		expect(prisma.post.createManyAndReturn).not.toHaveBeenCalled()
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
					file("2026-05-15-a.md", "Duplicate Title", "a"),
					file("2026-05-16-b.md", "Duplicate Title", "b"),
				],
			})
		)

		const data = await response.json()
		expect(data.created).toBe(1)
		expect(data.skipped).toEqual([
			{
				filename: "2026-05-16-b.md",
				reason: expect.stringMatching(/duplicate/i),
			},
		])
	})

	it("does not call createManyAndReturn when every file is skipped", async () => {
		const response = await POST(
			makeRequest({
				section: "tech",
				files: [file("garbage.md", "Garbage", "body")],
			})
		)

		expect(response.status).toBe(200)
		expect(prisma.post.createManyAndReturn).not.toHaveBeenCalled()
	})

	it("skips a file whose title sanitizes to an empty slug", async () => {
		// Frontmatter title `!!!`; `createSlug("!!!")` returns "" because every
		// char is in the punctuation-strip class. Route must surface this as a
		// skip rather than attempting an empty-slug insert.
		const response = await POST(
			makeRequest({
				section: "tech",
				files: [file("2026-05-15-punct.md", "!!!", "body")],
			})
		)

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.created).toBe(0)
		expect(data.skipped).toEqual([
			{
				filename: "2026-05-15-punct.md",
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
				files: [file("2026-05-15-shared.md", "Shared", "t")],
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
				files: [file("2026-05-15-shared.md", "Shared", "l")],
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
					file("2026-05-15-winner.md", "Winner", "w"),
					file("2026-05-15-loser.md", "Loser", "l"),
				],
			})
		)

		const data = await response.json()
		expect(data.created).toBe(1)
		expect(data.skipped).toEqual([
			{
				filename: "2026-05-15-loser.md",
				reason: expect.stringMatching(/concurrent/i),
			},
		])
	})
})

// #endregion

// #region Frontmatter

describe("POST /api/admin/posts/bulk frontmatter", () => {
	it("stores the title and slug from frontmatter, not the filename label", async () => {
		await POST(
			makeRequest({
				section: "tech",
				files: [
					file("2026-05-15-any-label.md", "A real post", "Actual body text."),
				],
			})
		)

		const insertCall = vi.mocked(prisma.post.createManyAndReturn).mock
			.calls[0]?.[0]
		const data = insertCall?.data as Array<{
			title: string
			slug: string
			body: string
			summary: string
		}>
		expect(data[0].title).toBe("A real post")
		expect(data[0].slug).toBe("a-real-post")
		expect(data[0].body).toBe("Actual body text.")
		expect(data[0].summary).toBe("Actual body text.")
	})

	it("derives the slug from a title the filename can't hold", async () => {
		vi.mocked(prisma.post.createManyAndReturn).mockResolvedValue([
			{ id: 1, slug: "debuggex-com", section: "tech" } as never,
		])

		await POST(
			makeRequest({
				section: "tech",
				files: [
					file("2013-10-18-debuggex-dot-com.md", "Debuggex.com", "Body."),
				],
			})
		)

		const insertCall = vi.mocked(prisma.post.createManyAndReturn).mock
			.calls[0]?.[0]
		const data = insertCall?.data as Array<{ title: string; slug: string }>
		expect(data[0].title).toBe("Debuggex.com")
		expect(data[0].slug).toBe("debuggex-com")
	})

	it("uses an explicit `slug:` over the title", async () => {
		vi.mocked(prisma.post.createManyAndReturn).mockResolvedValue([
			{ id: 1, slug: "the-original-slug", section: "tech" } as never,
		])

		await POST(
			makeRequest({
				section: "tech",
				files: [
					{
						filename: "2026-05-15-renamed.md",
						content: `---\ntitle: "A much better title"\nslug: the-original-slug\n---\n\nBody.`,
					},
				],
			})
		)

		const insertCall = vi.mocked(prisma.post.createManyAndReturn).mock
			.calls[0]?.[0]
		const data = insertCall?.data as Array<{ title: string; slug: string }>
		expect(data[0].title).toBe("A much better title")
		expect(data[0].slug).toBe("the-original-slug")
	})

	it("matches an explicit `slug:` against the existing row, not a title-derived duplicate", async () => {
		// The regression this pins: a retitled file whose `slug:` names an
		// existing row must collide with it (skip), not slip past the pre-query
		// under a freshly derived slug and fork a duplicate post.
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			{ slug: "the-original-slug" } as never,
		])
		vi.mocked(prisma.post.createManyAndReturn).mockResolvedValue([])

		const response = await POST(
			makeRequest({
				section: "tech",
				files: [
					{
						filename: "2026-05-15-renamed.md",
						content: `---\ntitle: "A much better title"\nslug: the-original-slug\n---\n\nBody.`,
					},
				],
			})
		)

		const data = await response.json()
		expect(data.created).toBe(0)
		expect(data.skipped).toEqual([
			{
				filename: "2026-05-15-renamed.md",
				reason: expect.stringMatching(/already exists/i),
			},
		])
		expect(prisma.post.createManyAndReturn).not.toHaveBeenCalled()
	})

	it("normalizes a non-canonical explicit `slug:`", async () => {
		vi.mocked(prisma.post.createManyAndReturn).mockResolvedValue([
			{ id: 1, slug: "my-cool-slug", section: "tech" } as never,
		])

		await POST(
			makeRequest({
				section: "tech",
				files: [
					{
						filename: "2026-05-15-messy.md",
						content: `---\ntitle: "The tools"\nslug: "My Cool Slug"\n---\n\nBody.`,
					},
				],
			})
		)

		const insertCall = vi.mocked(prisma.post.createManyAndReturn).mock
			.calls[0]?.[0]
		const data = insertCall?.data as Array<{ slug: string }>
		expect(data[0].slug).toBe("my-cool-slug")
	})

	it("skips a `slug:` that normalizes to an empty slug", async () => {
		const response = await POST(
			makeRequest({
				section: "tech",
				files: [
					{
						filename: "2026-05-15-punct.md",
						content: `---\ntitle: "The tools"\nslug: "!!!"\n---\n\nBody.`,
					},
				],
			})
		)

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.created).toBe(0)
		expect(data.skipped).toEqual([
			{
				filename: "2026-05-15-punct.md",
				reason: expect.stringMatching(/`slug:` normalizes to an empty slug/),
			},
		])
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
				files: [validFile, file("2026-06-01-another.md", "Another", "x")],
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
				files: [file("garbage.md", "Garbage", "body")],
			})
		)

		expect(response.status).toBe(200)
		expect(revalidateTag).not.toHaveBeenCalled()
		const auditCalls = vi
			.mocked(console.info)
			.mock.calls.filter((c) => c[0] === "[api:admin:posts:BULK] success")
		expect(auditCalls).toEqual([])
	})

	it("derives summary from the body on every inserted row", async () => {
		// Bulk import has no per-file summary input — every created row must
		// carry an auto-derived summary so the OG meta description and feed
		// `<summary>` are never blank. Pins the contract against accidental
		// reintroduction of null summaries.
		await POST(
			makeRequest({
				section: "tech",
				files: [
					file("2026-05-15-first.md", "First", "First post body."),
					file("2026-05-16-second.md", "Second", "Second post body."),
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
					file("garbage.md", "Garbage", "body"),
					{ filename: "2026-05-15-nofm.md", content: "no frontmatter here" },
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
					file("2199-01-01-future.md", "Future", "f"),
					file("2000-01-01-past.md", "Past", "p"),
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
