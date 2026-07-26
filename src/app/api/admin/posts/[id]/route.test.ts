import { revalidateTag } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { isPrismaNotFound, prisma } from "@/lib/db/db"
import { DELETE, GET, PUT } from "./route"
import type { Prisma } from "@/generated/prisma/client"

vi.mock("@/lib/api/requireAdmin", async () => {
	const { requireAdminMockFactory } = await import("@/test/mocks/requireAdmin")

	return requireAdminMockFactory()
})

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db/db", () => ({
	prisma: {
		post: {
			findUnique: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		$transaction: vi.fn(),
	},
	isPrismaNotFound: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function params(id: string) {
	return { params: Promise.resolve({ id }) }
}

function putRequest(id: string, body: unknown) {
	return new Request(`http://localhost/api/admin/posts/${id}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
}

const existingPost = {
	id: 1,
	title: "Original Title",
	slug: "original-title",
	body: "Original body.",
	section: "tech" as const,
	datetime: "2025-01-01-1200",
	published: true,
	summary: "Original summary.",
	imageUrl: null,
	readingTime: null,
	createdAt: new Date(),
	updatedAt: new Date(),
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(isPrismaNotFound).mockReturnValue(false)
})

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/admin/posts/[id]", () => {
	it("returns 200 with the post when found", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)

		const response = await GET(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(200)

		const data = await response.json()
		expect(data.id).toBe(1)
	})

	it("returns 404 when the post is not found", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(null)

		const response = await GET(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(404)
	})

	it("returns 400 for a non-numeric id", async () => {
		const response = await GET(new Request("http://localhost"), params("abc"))
		expect(response.status).toBe(400)
	})
})

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe("PUT /api/admin/posts/[id]", () => {
	// PUT wraps `findUnique(previous section)` + `update` in a single
	// `prisma.$transaction`; the mock delegates `tx.post.*` straight back to
	// the top-level `prisma.post.*` mocks so existing tests can keep stubbing
	// via `prisma.post.update.mockResolvedValue(...)`.
	beforeEach(() => {
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn({
					post: {
						findUnique: vi.mocked(prisma.post.findUnique),
						update: vi.mocked(prisma.post.update),
					},
				} as unknown as Prisma.TransactionClient)
		)
	})

	it("returns 200 with the updated post", async () => {
		const updated = {
			...existingPost,
			title: "Updated Title",
			slug: "updated-title",
		}
		vi.mocked(prisma.post.update).mockResolvedValue(updated)

		const response = await PUT(
			putRequest("1", { title: "Updated Title" }),
			params("1")
		)
		expect(response.status).toBe(200)

		const data = await response.json()
		expect(data.title).toBe("Updated Title")
	})

	it("regenerates the slug when title changes", async () => {
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)
		await PUT(putRequest("1", { title: "Brand New Title" }), params("1"))

		const { data } = vi.mocked(prisma.post.update).mock.calls[0][0]
		expect(data.slug).toBe("brand-new-title")
	})

	it("does not include slug in update when title is not changed", async () => {
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)
		await PUT(putRequest("1", { published: false }), params("1"))

		const { data } = vi.mocked(prisma.post.update).mock.calls[0][0]
		expect(data.slug).toBeUndefined()
	})

	it("returns 400 for a non-numeric id", async () => {
		const response = await PUT(putRequest("abc", { title: "T" }), params("abc"))
		expect(response.status).toBe(400)
	})

	it("returns 400 for an invalid payload", async () => {
		const response = await PUT(
			putRequest("1", { imageUrl: "javascript:evil()" }),
			params("1")
		)
		expect(response.status).toBe(400)
	})

	it("returns 404 when the post does not exist", async () => {
		vi.mocked(isPrismaNotFound).mockReturnValue(true)
		vi.mocked(prisma.post.update).mockRejectedValue({ code: "P2025" })

		const response = await PUT(putRequest("1", { title: "T" }), params("1"))
		expect(response.status).toBe(404)
	})

	it("returns 500 on an unexpected prisma error", async () => {
		vi.mocked(prisma.post.update).mockRejectedValue(new Error("DB failure"))

		const response = await PUT(putRequest("1", { title: "T" }), params("1"))
		expect(response.status).toBe(500)
	})

	it("invalidates the blog section cache after update", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)

		await PUT(putRequest("1", { title: "Updated Title" }), params("1"))

		expect(revalidateTag).toHaveBeenCalledWith("blog-tech", "max")
	})

	it("invalidates BOTH section caches on a cross-section move (tech → life)", async () => {
		// Without busting the previous section, the moved post would linger in
		// `feed-tech` / `blog-tech` / archive until the 5-minute revalidate.
		vi.mocked(prisma.post.findUnique).mockResolvedValue({
			...existingPost,
			section: "tech",
		})
		vi.mocked(prisma.post.update).mockResolvedValue({
			...existingPost,
			section: "life",
		})

		await PUT(putRequest("1", { section: "life" }), params("1"))

		expect(revalidateTag).toHaveBeenCalledWith("blog-life", "max")
		expect(revalidateTag).toHaveBeenCalledWith("blog-tech", "max")
	})

	it("does not double-bust when the section is unchanged", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)

		await PUT(putRequest("1", { title: "x" }), params("1"))

		// Only the current section's tags should fire — not both.
		const blogCalls = vi
			.mocked(revalidateTag)
			.mock.calls.filter(([tag]) => tag === "blog-tech" || tag === "blog-life")
		expect(blogCalls.filter(([t]) => t === "blog-tech")).toHaveLength(1)
		expect(blogCalls.filter(([t]) => t === "blog-life")).toHaveLength(0)
	})

	it("emits an info-level audit log on successful update including previousSection", async () => {
		// Cross-section moves and in-place edits look identical in the access log;
		// the audit line is the only signal that distinguishes them.
		vi.mocked(prisma.post.findUnique).mockResolvedValue({
			...existingPost,
			section: "tech",
		})
		vi.mocked(prisma.post.update).mockResolvedValue({
			...existingPost,
			section: "life",
		})

		await PUT(putRequest("1", { section: "life" }), params("1"))

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:posts:PUT] success",
			{
				id: 1,
				slug: existingPost.slug,
				section: "life",
				sortOrder: null,
				previousSection: "tech",
				previousSlug: null,
				batchId: null,
			}
		)
	})

	it("reads the previous section inside the same transaction as the update", async () => {
		// Without the transaction, two concurrent PUTs could observe the same
		// `previous.section`, leaving one side of a cross-section move with a
		// stale cache. The transaction is the load-bearing fix for that race.
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)

		await PUT(putRequest("1", { title: "x" }), params("1"))

		expect(prisma.$transaction).toHaveBeenCalledTimes(1)
		// `body` and `summary` are included so the summary-resolution rules
		// can compare against pre-update state inside the same txn.
		expect(prisma.post.findUnique).toHaveBeenCalledWith(
			expect.objectContaining({
				select: { section: true, slug: true, body: true, summary: true },
			})
		)
	})

	it("audits previousSlug when a title rename changes the slug", async () => {
		// A title edit derives a new slug via `createSlug(title)`; the audit line
		// must show the prior slug so a rename is distinguishable from an in-place
		// edit in logs.
		vi.mocked(prisma.post.findUnique).mockResolvedValue({
			...existingPost,
			slug: "old-slug",
		})
		vi.mocked(prisma.post.update).mockResolvedValue({
			...existingPost,
			slug: "new-slug",
		})

		await PUT(putRequest("1", { title: "Brand new title" }), params("1"))

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:posts:PUT] success",
			expect.objectContaining({
				slug: "new-slug",
				previousSlug: "old-slug",
			})
		)
	})

	it("audits previousSlug as null when the body is updated but the slug is unchanged", async () => {
		// `previousSlug` semantically means "the slug renamed, here's what it
		// was". An in-place body or section edit must NOT surface a previousSlug
		// that equals the current slug; the field would be misread as a rename.
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)

		await PUT(putRequest("1", { body: "Updated body" }), params("1"))

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:posts:PUT] success",
			expect.objectContaining({
				slug: existingPost.slug,
				previousSlug: null,
			})
		)
	})

	// #region summary auto-derive

	it("re-derives summary from new body when body changes and summary is untouched", async () => {
		// Form ships `summary: state.summary || undefined`, so an untouched
		// summary field arrives as the verbatim previous string. With body
		// changed, the summary should track the new body.
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)

		await PUT(
			putRequest("1", {
				body: "A brand new body for this post.",
				summary: "Original summary.",
			}),
			params("1")
		)

		const { data } = vi.mocked(prisma.post.update).mock.calls[0][0]
		expect(data.summary).toBe("A brand new body for this post.")
	})

	it("keeps the user's summary when authored (differs from previous)", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)

		await PUT(
			putRequest("1", {
				body: "A brand new body for this post.",
				summary: "Hand-written replacement.",
			}),
			params("1")
		)

		const { data } = vi.mocked(prisma.post.update).mock.calls[0][0]
		expect(data.summary).toBe("Hand-written replacement.")
	})

	it("re-derives summary when the user clears the field (key omitted)", async () => {
		// "Never empty" invariant — a cleared summary always falls back to a
		// derived one. The form omits the key entirely for empty strings.
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)

		await PUT(
			putRequest("1", { body: "A brand new body for this post." }),
			params("1")
		)

		const { data } = vi.mocked(prisma.post.update).mock.calls[0][0]
		expect(data.summary).toBe("A brand new body for this post.")
	})

	it("re-derives summary from previous body when only summary is cleared", async () => {
		// User cleared the field without touching the body. We still refuse
		// to store empty, so derive from the unchanged previous body.
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)

		await PUT(putRequest("1", { title: "Renamed" }), params("1"))

		const { data } = vi.mocked(prisma.post.update).mock.calls[0][0]
		expect(data.summary).toBe("Original body.")
	})

	it("leaves summary untouched when body is unchanged and summary matches previous", async () => {
		// Pure metadata edit (e.g. toggling published) shouldn't churn the
		// summary column. Prisma treats `undefined` as "skip this column",
		// which is what we want — no write amplification.
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		vi.mocked(prisma.post.update).mockResolvedValue(existingPost)

		await PUT(
			putRequest("1", {
				published: false,
				summary: "Original summary.",
			}),
			params("1")
		)

		const { data } = vi.mocked(prisma.post.update).mock.calls[0][0]
		expect(data.summary).toBeUndefined()
	})

	it("returns 400 when summary exceeds 160 chars", async () => {
		const response = await PUT(
			putRequest("1", { summary: "a".repeat(161) }),
			params("1")
		)
		expect(response.status).toBe(400)
	})

	// #endregion

	it("returns 500 on a Serializable serialization_failure (P2034)", async () => {
		// The PUT runs at Serializable isolation to close the cross-section
		// cache-invalidation race; a `serialization_failure` (Prisma error
		// code P2034) is essentially impossible at single-admin volumes but
		// must surface as a generic 500 with no retry loop (matches projects
		// PUT). Pin the contract so a future refactor that swallows or
		// retries the error has a guard.
		vi.mocked(prisma.$transaction).mockRejectedValueOnce({
			code: "P2034",
			message: "Transaction failed due to a write conflict",
		})

		const response = await PUT(
			putRequest("1", { title: "Renamed under contention" }),
			params("1")
		)
		expect(response.status).toBe(500)

		// Audit-tag must NOT emit on failure — a serialization_failure means
		// the txn was rolled back, so the write never happened.
		expect(vi.mocked(console.info)).not.toHaveBeenCalledWith(
			"[api:admin:posts:PUT] success",
			expect.anything()
		)
	})
})

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/posts/[id]", () => {
	it("returns 204 on successful deletion", async () => {
		vi.mocked(prisma.post.delete).mockResolvedValue(existingPost)

		const response = await DELETE(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(204)
	})

	it("emits an info-level audit log on successful deletion", async () => {
		// Deletions are the highest-stakes admin write; the audit line is the
		// only structured signal a deletion happened.
		vi.mocked(prisma.post.delete).mockResolvedValue(existingPost)

		await DELETE(new Request("http://localhost"), params("1"))

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:posts:DELETE] success",
			{
				id: 1,
				slug: existingPost.slug,
				section: existingPost.section,
				sortOrder: null,
				previousSection: null,
				previousSlug: null,
				batchId: null,
			}
		)
	})

	it("returns 400 for a non-numeric id", async () => {
		const response = await DELETE(
			new Request("http://localhost"),
			params("abc")
		)
		expect(response.status).toBe(400)
	})

	it("returns 404 when the post does not exist", async () => {
		vi.mocked(isPrismaNotFound).mockReturnValue(true)
		vi.mocked(prisma.post.delete).mockRejectedValue({ code: "P2025" })

		const response = await DELETE(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(404)
	})

	it("returns 500 on an unexpected prisma error", async () => {
		vi.mocked(prisma.post.delete).mockRejectedValue(new Error("DB failure"))

		const response = await DELETE(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(500)
	})

	it("invalidates the blog section cache after deletion", async () => {
		vi.mocked(prisma.post.delete).mockResolvedValue(existingPost)

		const response = await DELETE(new Request("http://localhost"), params("1"))
		expect(response.status).toBe(204)
		expect(revalidateTag).toHaveBeenCalledWith("blog-tech", "max")
	})
})
