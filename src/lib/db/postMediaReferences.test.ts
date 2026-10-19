import { describe, expect, it, vi } from "vitest"
import { namedByOtherPosts, type PostBodySearch } from "./postMediaReferences"

const SHOT = "https://store/posts/life/foo/aaaa-shot.png"
const DEMO = "https://store/posts/life/foo/bbbb-demo.mp4"

/** A posts table holding these bodies, whatever the query asks. */
function tableWith(...bodies: string[]) {
	const findMany = vi.fn(async () => bodies.map((body) => ({ body })))

	return {
		client: { post: { findMany } } as unknown as PostBodySearch,
		findMany,
	}
}

describe("namedByOtherPosts", () => {
	it("returns the URLs some other post's body names", async () => {
		const { client } = tableWith(`![Shot](${SHOT}) and more`)

		const named = await namedByOtherPosts(client, null)([SHOT, DEMO])

		expect([...named]).toEqual([SHOT])
	})

	it("asks with one `contains` per URL, and only for the bodies", async () => {
		const { client, findMany } = tableWith()

		await namedByOtherPosts(client, null)([SHOT, DEMO])

		expect(findMany).toHaveBeenCalledWith({
			where: {
				OR: [{ body: { contains: SHOT } }, { body: { contains: DEMO } }],
			},
			select: { body: true },
		})
	})

	it("leaves the swept post itself out", async () => {
		const { client, findMany } = tableWith()

		await namedByOtherPosts(client, { section: "life", slug: "foo" })([SHOT])

		expect(findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					NOT: { section: "life", slug: "foo" },
				}),
			})
		)
	})

	it("checks the match in memory, so a looser database match keeps nothing it shouldn't", async () => {
		// A row that came back without naming the URL (a pattern read loosely)
		// must not keep the blob.
		const { client } = tableWith("Text only.")

		expect((await namedByOtherPosts(client, null)([SHOT])).size).toBe(0)
	})

	it("doesn't query for no URLs", async () => {
		const { client, findMany } = tableWith()

		expect((await namedByOtherPosts(client, null)([])).size).toBe(0)
		expect(findMany).not.toHaveBeenCalled()
	})

	it("lets a query failure propagate, so the caller deletes nothing", async () => {
		const client = {
			post: {
				findMany: vi.fn(async () => {
					throw new Error("db down")
				}),
			},
		} as unknown as PostBodySearch

		await expect(namedByOtherPosts(client, null)([SHOT])).rejects.toThrow(
			"db down"
		)
	})
})
