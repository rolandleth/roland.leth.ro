import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { generateMetadata, default as EditPostPage } from "./page"

vi.mock("@/lib/db", () => ({
	prisma: {
		post: { findUnique: vi.fn() },
	},
}))

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NOT_FOUND")
	}),
}))

const mockPostForm = vi.fn().mockReturnValue(null)
vi.mock("@/components/admin/PostForm", () => ({ default: mockPostForm }))

function makeParams(id: string) {
	return { params: Promise.resolve({ id }) }
}

const existingPost = {
	id: 1,
	title: "My Post",
	body: "Content",
	section: "tech",
	datetime: "2025-01-01-1200",
	published: true,
	summary: null,
	imageUrl: null,
	readingTime: null,
	slug: "my-post",
	createdAt: new Date(),
	updatedAt: new Date(),
}

beforeEach(() => {
	vi.resetAllMocks()
	mockPostForm.mockReturnValue(null)
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

	it("queries only the title field", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		await generateMetadata(makeParams("1"))
		expect(vi.mocked(prisma.post.findUnique)).toHaveBeenCalledWith({
			where: { id: 1 },
			select: { title: true },
		})
	})

	it("does not query the db for a non-numeric id", async () => {
		await generateMetadata(makeParams("abc"))
		expect(vi.mocked(prisma.post.findUnique)).not.toHaveBeenCalled()
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
		await EditPostPage(makeParams("1"))
		expect(mockPostForm).toHaveBeenCalledWith(
			expect.objectContaining({ initialData: existingPost }),
			expect.anything()
		)
	})

	it("queries prisma with the correct id", async () => {
		vi.mocked(prisma.post.findUnique).mockResolvedValue(existingPost)
		await EditPostPage(makeParams("5"))
		expect(vi.mocked(prisma.post.findUnique)).toHaveBeenCalledWith({
			where: { id: 5 },
		})
	})
})
