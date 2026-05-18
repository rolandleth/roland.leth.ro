import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/db"
import { generateMetadata, default as EditPostPage } from "./page"

vi.mock("@/lib/db/db", () => ({
	prisma: {
		post: { findUnique: vi.fn() },
	},
}))

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NOT_FOUND")
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
})
