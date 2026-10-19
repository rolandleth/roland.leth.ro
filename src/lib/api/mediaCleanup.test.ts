import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db/db"
import { blobStore } from "@/lib/import/blobStore"
import { FAKE_STORE_ORIGIN } from "@/test/blobStore"
import { cleanUpPostMedia, cleanUpProjectMedia } from "./mediaCleanup"
import type { BlobListPage, ListedBlob } from "@/lib/import/blobSync"

vi.mock("@/lib/import/blobStore", () => ({
	blobStore: { list: vi.fn(), put: vi.fn(), del: vi.fn() },
}))

// The check for blobs another post still names. Its query is covered in
// `postMediaReferences.test.ts`; here only its answer matters.
vi.mock("@/lib/db/db", () => ({
	prisma: { post: { findMany: vi.fn() } },
}))

/** Makes the posts table hold these bodies. */
function otherPostBodies(...bodies: string[]) {
	vi.mocked(prisma.post.findMany).mockResolvedValue(
		bodies.map((body) => ({ body })) as Awaited<
			ReturnType<typeof prisma.post.findMany>
		>
	)
}

const POST_TAG = "[api:admin:posts:DELETE]"
const PROJECT_TAG = "[api:admin:projects:DELETE]"

function listed(pathname: string): ListedBlob {
	return {
		pathname,
		url: `${FAKE_STORE_ORIGIN}/${pathname}`,
		size: 8,
		uploadedAt: new Date("2026-10-01T00:00:00Z"),
	}
}

/** Makes the store hold `blobs`, listing them by prefix as the real one does. */
function holdInStore(blobs: ListedBlob[]) {
	vi.mocked(blobStore.list).mockImplementation(
		async ({ prefix }): Promise<BlobListPage> => ({
			blobs: blobs.filter((blob) => blob.pathname.startsWith(prefix)),
			hasMore: false,
		})
	)
}

function deletedUrls(): string[] {
	return vi.mocked(blobStore.del).mock.calls.flatMap(([urls]) => urls)
}

beforeEach(() => {
	vi.resetAllMocks()
	otherPostBodies()
	vi.spyOn(console, "info").mockImplementation(() => undefined)
	vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

// #region Posts

describe("cleanUpPostMedia", () => {
	const shot = listed("posts/tech/my-post/aaaa-shot.png")
	const demo = listed("posts/tech/my-post/bbbb-demo.mp4")
	const post = {
		section: "tech" as const,
		slug: "my-post",
		body: `![Shot](${shot.url})\n\n![Demo](${demo.url})`,
	}

	it("deletes the post's media from the store", async () => {
		holdInStore([shot, demo, listed("posts/tech/other/cccc-shot.png")])

		await cleanUpPostMedia(post, POST_TAG)

		expect(deletedUrls().sort()).toEqual([shot.url, demo.url].sort())
	})

	it("logs how many blobs went, under the route's tag", async () => {
		holdInStore([shot, demo])

		await cleanUpPostMedia(post, POST_TAG)

		expect(console.info).toHaveBeenCalledWith(`${POST_TAG} media deleted`, {
			section: "tech",
			slug: "my-post",
			count: 2,
		})
	})

	it("logs nothing and deletes nothing for a post with no media", async () => {
		holdInStore([])

		await cleanUpPostMedia({ ...post, body: "Text only." }, POST_TAG)

		expect(blobStore.del).not.toHaveBeenCalled()
		expect(console.info).not.toHaveBeenCalled()
		expect(console.warn).not.toHaveBeenCalled()
	})

	it("never logs the post's body", async () => {
		holdInStore([shot])

		await cleanUpPostMedia(post, POST_TAG)

		expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
			"![Shot]"
		)
	})

	it("resolves and warns when the store can't be listed", async () => {
		vi.mocked(blobStore.list).mockRejectedValue(
			new Error("Vercel Blob: No token found")
		)

		await expect(cleanUpPostMedia(post, POST_TAG)).resolves.toBeUndefined()

		expect(blobStore.del).not.toHaveBeenCalled()
		expect(console.warn).toHaveBeenCalledWith(
			`${POST_TAG} media cleanup failed`,
			expect.objectContaining({
				section: "tech",
				slug: "my-post",
				message: "Vercel Blob: No token found",
				stack: expect.stringContaining("Vercel Blob: No token found"),
			})
		)
	})

	it("resolves and warns with how far it got when the delete fails", async () => {
		holdInStore([shot])
		vi.mocked(blobStore.del).mockRejectedValue(new Error("del down"))

		await expect(cleanUpPostMedia(post, POST_TAG)).resolves.toBeUndefined()

		expect(console.warn).toHaveBeenCalledWith(
			`${POST_TAG} media cleanup failed`,
			expect.objectContaining({
				section: "tech",
				slug: "my-post",
				message: "Deleted 0 of 1 blob(s), then failed: del down",
				deleted: 0,
				remaining: 1,
			})
		)
		expect(console.info).not.toHaveBeenCalled()
	})

	it("keeps a blob another post's body still names", async () => {
		// A post moved to life links to this one's screenshot.
		holdInStore([shot, demo])
		otherPostBodies(`![Shot](${shot.url})`)

		await cleanUpPostMedia(post, POST_TAG)

		expect(deletedUrls()).toEqual([demo.url])
	})

	it("asks about every other post, since the deleted row is gone", async () => {
		holdInStore([shot])

		await cleanUpPostMedia(post, POST_TAG)

		const [args] = vi.mocked(prisma.post.findMany).mock.calls[0]

		expect(args?.where).not.toHaveProperty("NOT")
	})

	it("deletes nothing and warns when the check fails", async () => {
		holdInStore([shot])
		vi.mocked(prisma.post.findMany).mockRejectedValue(new Error("db down"))

		await expect(cleanUpPostMedia(post, POST_TAG)).resolves.toBeUndefined()

		expect(blobStore.del).not.toHaveBeenCalled()
		expect(console.warn).toHaveBeenCalledWith(
			`${POST_TAG} media cleanup failed`,
			expect.objectContaining({ message: "db down" })
		)
	})

	it("never uploads", async () => {
		holdInStore([shot])

		await cleanUpPostMedia(post, POST_TAG)

		expect(blobStore.put).not.toHaveBeenCalled()
	})
})

// #endregion

// #region Projects

describe("cleanUpProjectMedia", () => {
	const icon = listed("projects/reckon/aaaa-icon.png")
	const shot = listed("projects/reckon/shots/bbbb-1.png")

	it("deletes every blob under the project's prefix", async () => {
		holdInStore([icon, shot])

		await cleanUpProjectMedia("reckon", PROJECT_TAG)

		expect(deletedUrls().sort()).toEqual([icon.url, shot.url].sort())
	})

	it("leaves other projects, a slug that only starts the same, and post media", async () => {
		holdInStore([
			icon,
			listed("projects/continuum/cccc-icon.png"),
			listed("projects/reckon-two/dddd-icon.png"),
			listed("posts/tech/reckon/eeee-shot.png"),
		])

		await cleanUpProjectMedia("reckon", PROJECT_TAG)

		expect(deletedUrls()).toEqual([icon.url])
	})

	it("logs how many blobs went, under the route's tag", async () => {
		holdInStore([icon, shot])

		await cleanUpProjectMedia("reckon", PROJECT_TAG)

		expect(console.info).toHaveBeenCalledWith(`${PROJECT_TAG} media deleted`, {
			slug: "reckon",
			count: 2,
		})
	})

	it("logs nothing and deletes nothing for a project with no media", async () => {
		holdInStore([])

		await cleanUpProjectMedia("reckon", PROJECT_TAG)

		expect(blobStore.del).not.toHaveBeenCalled()
		expect(console.info).not.toHaveBeenCalled()
	})

	it("resolves and warns when the store fails", async () => {
		vi.mocked(blobStore.list).mockRejectedValue(new Error("list down"))

		await expect(
			cleanUpProjectMedia("reckon", PROJECT_TAG)
		).resolves.toBeUndefined()

		expect(console.warn).toHaveBeenCalledWith(
			`${PROJECT_TAG} media cleanup failed`,
			expect.objectContaining({ slug: "reckon", message: "list down" })
		)
	})
})

// #endregion
