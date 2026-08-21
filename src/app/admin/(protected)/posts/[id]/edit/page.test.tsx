import { beforeEach, describe, expect, it, vi } from "vitest"
import { verifySession } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/db"
import { generateMetadata, default as EditPostPage } from "./page"

vi.mock("@/lib/db/db", () => ({
	prisma: {
		post: { findUnique: vi.fn() },
	},
}))

// `generateMetadata` guards its own DB read via `adminEditMetadata` — it runs
// outside `(protected)/layout.tsx`, so the real `verifySession` would reach for
// request-scoped cookies that don't exist here.
vi.mock("@/lib/auth/auth", () => ({
	verifySession: vi.fn(),
}))

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NOT_FOUND")
	}),
	redirect: vi.fn(() => {
		throw new Error("REDIRECT")
	}),
}))

vi.mock("@/components/admin/PostForm", () => ({
	default: function MockPostForm() {
		return null
	},
}))

function makeParams(id: string) {
	return { params: Promise.resolve({ id }) }
}

const existingPost = {
	id: 1,
	title: "My Post",
	body: "Content",
	section: "tech" as const,
	datetime: "2025-01-01-1200",
	published: true,
	summary: "Content",
	imageUrl: null,
	readingTime: null,
	slug: "my-post",
	createdAt: new Date(),
	updatedAt: new Date(),
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(verifySession).mockResolvedValue(true)
})

// ---------------------------------------------------------------------------

describe("generateMetadata", () => {
	it("returns 'Edit post' for a non-numeric id", async () => {
		const result = await generateMetadata(makeParams("abc"))
		expect(result).toEqual({ title: "Edit post" })
	})

	it("returns 'Edit post' when the post does not exist", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(null)
		const result = await generateMetadata(makeParams("99"))
		expect(result).toEqual({ title: "Edit post" })
	})

	it("returns 'Edit: {title}' when the post exists", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		const result = await generateMetadata(makeParams("1"))
		expect(result).toEqual({ title: "Edit: My Post" })
	})

	it("queries by id (single fetch shared with the page body via React cache())", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		await generateMetadata(makeParams("1"))
		expect(vi.mocked(prisma.post.findUnique)).toHaveBeenCalledWith({
			where: { id: 1 },
		})
	})

	it("does not query the db for a non-numeric id", async () => {
		await generateMetadata(makeParams("abc"))
		expect(vi.mocked(prisma.post.findUnique)).not.toHaveBeenCalled()
	})

	it("does not query the db without a valid session", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		const result = await generateMetadata(makeParams("1"))

		expect(result).toEqual({ title: "Edit post" })
		expect(vi.mocked(prisma.post.findUnique)).not.toHaveBeenCalled()
	})

	// Asserted here, not just in `adminMetadata.test.ts`: that suite passes the
	// tag in by hand, so it proves nothing about what this page supplies. This is
	// the only test that fails if the posts page ships the projects tag.
	it("logs the bypass with this page's tag", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await generateMetadata(makeParams("1"))

		expect(vi.mocked(console.error)).toHaveBeenCalledWith(
			expect.stringContaining("[admin:posts:edit]"),
			expect.objectContaining({ surface: "generateMetadata", id: "1" })
		)
	})
})

// ---------------------------------------------------------------------------

describe("EditPostPage", () => {
	it("calls notFound for a non-numeric id", async () => {
		await expect(EditPostPage(makeParams("abc"))).rejects.toThrow("NOT_FOUND")
	})

	it("calls notFound when the post does not exist", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(null)
		await expect(EditPostPage(makeParams("99"))).rejects.toThrow("NOT_FOUND")
	})

	it("renders PostForm with the post data", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		const element = await EditPostPage(makeParams("1"))
		expect(element.props.initialData).toEqual(existingPost)
	})

	it("queries prisma with the correct id", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		await EditPostPage(makeParams("5"))
		expect(vi.mocked(prisma.post.findUnique)).toHaveBeenCalledWith({
			where: { id: 5 },
		})
	})

	// `generateMetadata`'s guard only affects the <title> — it does not stop
	// this body from rendering, since Next calls the two independently. These
	// three are what actually stop the row from reaching the client.
	it("redirects to login without a valid session", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(EditPostPage(makeParams("1"))).rejects.toThrow("REDIRECT")
	})

	it("does not query the db without a valid session", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(EditPostPage(makeParams("1"))).rejects.toThrow("REDIRECT")
		expect(vi.mocked(prisma.post.findUnique)).not.toHaveBeenCalled()
	})

	it("logs the bypass under this page's tag with the page body surface", async () => {
		vi.mocked(verifySession).mockResolvedValue(false)

		await expect(EditPostPage(makeParams("1"))).rejects.toThrow("REDIRECT")

		expect(vi.mocked(console.error)).toHaveBeenCalledWith(
			expect.stringContaining("[admin:posts:edit]"),
			expect.objectContaining({ surface: "the page body" })
		)
	})
})
