import { describe, expect, it, vi } from "vitest"
import { buildPostFile, setFrontmatterSlug } from "@/lib/import/frontmatter"
import { parsePostFiles } from "@/lib/import/postImport"
import { postMediaPrefixFor } from "@/lib/import/postMedia"
import {
	loadPostMedia,
	type LoadedPostMedia,
	logPendingUploads,
	type MediaReader,
	pendingMediaPaths,
	planPostImportWithMedia,
	previewPostBody,
	prunePostMedia,
	uploadPostMedia,
	writtenBodies,
	writtenSlugs,
} from "@/lib/import/postMediaRun"
import { FAKE_STORE_ORIGIN, makeStore } from "@/test/blobStore"
import { ftypBox } from "@/test/mediaBytes"
import type { BlobStore, ListedBlob, StoredBlob } from "@/lib/import/blobSync"
import type { ExistingPost, ImportPlan } from "@/lib/import/postImport"

// Blobs these tests put in a listing by hand sit where the fake store's `put`
// would have put them.
const STORE = FAKE_STORE_ORIGIN
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])
const OTHER_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9])
const MP4 = ftypBox("isom", ["isom", "mp41"])

/** A file system holding `files`, by path relative to the post's folder. */
function readerOf(files: Record<string, Uint8Array>): MediaReader {
	return async (relativePath) => files[relativePath] ?? null
}

async function load(
	body: string,
	files: Record<string, Uint8Array>
): Promise<LoadedPostMedia> {
	const result = await loadPostMedia({
		body,
		section: "tech",
		slug: "my-post",
		read: readerOf(files),
	})

	if (!result.ok) {
		throw new Error(`Load failed: ${result.reason}`)
	}

	return result.media
}

/** The store as it is after `media` was uploaded once. */
function storedFor(media: LoadedPostMedia): Map<string, StoredBlob> {
	return new Map(
		[...media.loaded.values()].map((image) => [
			image.key,
			{ url: `${STORE}/${image.key}`, size: image.size },
		])
	)
}

function listed(pathname: string, size = 8): ListedBlob {
	return {
		pathname,
		url: `${STORE}/${pathname}`,
		size,
		uploadedAt: new Date("2026-10-01T00:00:00Z"),
	}
}

// #region loadPostMedia

describe("loadPostMedia", () => {
	it("loads nothing for a body with no local media, without reading a file", async () => {
		const read = vi.fn<MediaReader>()
		const body = "Text and ![a](/images/a.png)."
		const result = await loadPostMedia({
			body,
			section: "tech",
			slug: "my-post",
			read,
		})

		expect(result).toEqual({
			ok: true,
			media: { body, refs: [], paths: [], loaded: new Map() },
		})
		expect(read).not.toHaveBeenCalled()
	})

	it("reads each referenced file and keys it under the post's prefix", async () => {
		const media = await load(
			"![Shot](media/shot.png)\n\n![Demo](media/demo.mp4)",
			{ "media/shot.png": PNG, "media/demo.mp4": MP4 }
		)

		expect(media.paths).toEqual(["media/shot.png", "media/demo.mp4"])

		for (const relativePath of media.paths) {
			const image = media.loaded.get(relativePath)

			expect(image?.key.startsWith(postMediaPrefixFor("tech", "my-post"))).toBe(
				true
			)
		}

		expect(media.loaded.get("media/shot.png")).toMatchObject({
			buffer: PNG,
			size: PNG.length,
		})
	})

	it("keeps the body the references were found in", async () => {
		const body = "![Shot](media/shot.png)"
		const media = await load(body, { "media/shot.png": PNG })

		expect(media.body).toBe(body)
	})

	it("reads a file referenced twice once", async () => {
		const read = vi.fn(readerOf({ "media/a.png": PNG }))

		await loadPostMedia({
			body: "![a](media/a.png) ![again](./media/a.png)",
			section: "tech",
			slug: "my-post",
			read,
		})

		expect(read).toHaveBeenCalledTimes(1)
	})

	it("gives the same bytes the same key, and changed bytes a new one", async () => {
		const first = await load("![a](media/a.png)", { "media/a.png": PNG })
		const again = await load("![a](media/a.png)", { "media/a.png": PNG })
		const edited = await load("![a](media/a.png)", { "media/a.png": OTHER_PNG })

		expect(again.loaded.get("media/a.png")?.key).toBe(
			first.loaded.get("media/a.png")?.key
		)
		expect(edited.loaded.get("media/a.png")?.key).not.toBe(
			first.loaded.get("media/a.png")?.key
		)
	})

	it("keys the same file apart for two posts", async () => {
		const forPost = async (slug: string) => {
			const result = await loadPostMedia({
				body: "![a](media/a.png)",
				section: "tech",
				slug,
				read: readerOf({ "media/a.png": PNG }),
			})

			return result.ok ? result.media.loaded.get("media/a.png")?.key : null
		}

		expect(await forPost("one")).not.toBe(await forPost("two"))
	})

	it("fails with the file's name when a file is missing", async () => {
		const result = await loadPostMedia({
			body: "![a](media/a.png)\n\n![b](media/missing.png)",
			section: "tech",
			slug: "my-post",
			read: readerOf({ "media/a.png": PNG }),
		})

		expect(result).toEqual({
			ok: false,
			reason: "Media file not found: media/missing.png",
		})
	})

	it("fails with the file check's reason for an unsupported file", async () => {
		const result = await loadPostMedia({
			body: "![a](media/clip.mov)",
			section: "tech",
			slug: "my-post",
			read: readerOf({ "media/clip.mov": MP4 }),
		})

		expect(result.ok).toBe(false)
		expect(result).toMatchObject({
			reason: expect.stringContaining("not a supported media type"),
		})
	})

	it("fails with the scan's reason, without reading anything", async () => {
		const read = vi.fn<MediaReader>()
		const result = await loadPostMedia({
			body: "![a](../a.png)",
			section: "tech",
			slug: "my-post",
			read,
		})

		expect(result.ok).toBe(false)
		expect(read).not.toHaveBeenCalled()
	})

	it("lets a read failure other than a missing file propagate", async () => {
		const read: MediaReader = async () => {
			throw new Error("EACCES: permission denied")
		}

		await expect(
			loadPostMedia({
				body: "![a](media/a.png)",
				section: "tech",
				slug: "my-post",
				read,
			})
		).rejects.toThrow("EACCES")
	})
})

// #endregion

// #region previewPostBody

describe("previewPostBody", () => {
	const BODY = "![Shot](media/shot.png)\n\n![Demo](media/demo.mp4)"
	const FILES = { "media/shot.png": PNG, "media/demo.mp4": MP4 }

	it("uses the stored URL for a file the store already holds", async () => {
		const media = await load(BODY, FILES)
		const shotKey = media.loaded.get("media/shot.png")?.key

		expect(previewPostBody(media, storedFor(media))).toContain(
			`![Shot](${STORE}/${shotKey})`
		)
	})

	it("uses a placeholder URL for a file not uploaded yet", async () => {
		const media = await load(BODY, FILES)
		const preview = previewPostBody(media, new Map())

		expect(preview).toContain("![Shot](https://blob.local/posts/tech/my-post/")
		expect(preview).not.toContain(STORE)
	})

	it("is the body a real run stores when nothing is pending", async () => {
		// How a re-run recognizes an unchanged post: its preview equals the
		// stored body, so the plan has nothing to write.
		const media = await load(BODY, FILES)
		const existing = storedFor(media)
		const stored = await uploadPostMedia({
			store: makeStore(),
			media,
			existing,
			log: vi.fn(),
		})

		expect(previewPostBody(media, existing)).toBe(stored)
	})

	it("differs from the stored body once a file's bytes change", async () => {
		const before = await load(BODY, FILES)
		const existing = storedFor(before)
		const stored = previewPostBody(before, existing)
		const after = await load(BODY, { ...FILES, "media/shot.png": OTHER_PNG })

		expect(previewPostBody(after, existing)).not.toBe(stored)
	})

	it("returns a body with no local media as it is", async () => {
		const body = "Text and ![a](/images/a.png)."
		const media = await load(body, {})

		expect(previewPostBody(media, new Map())).toBe(body)
	})
})

// #endregion

// #region pendingMediaPaths and logPendingUploads

describe("pendingMediaPaths", () => {
	const BODY = "![Shot](media/shot.png)\n\n![Demo](media/demo.mp4)"
	const FILES = { "media/shot.png": PNG, "media/demo.mp4": MP4 }

	it("names every file when the store holds none", async () => {
		const media = await load(BODY, FILES)

		expect(pendingMediaPaths(media, new Map())).toEqual([
			"media/shot.png",
			"media/demo.mp4",
		])
	})

	it("names only the files the store doesn't hold", async () => {
		const media = await load(BODY, FILES)
		const existing = storedFor(media)
		const demoKey = media.loaded.get("media/demo.mp4")?.key ?? ""
		existing.delete(demoKey)

		expect(pendingMediaPaths(media, existing)).toEqual(["media/demo.mp4"])
	})

	it("names nothing when the store holds them all", async () => {
		const media = await load(BODY, FILES)

		expect(pendingMediaPaths(media, storedFor(media))).toEqual([])
	})

	it("logs one line per pending file, with its size", async () => {
		const media = await load(BODY, FILES)
		const log = vi.fn()

		logPendingUploads(media, new Map(), log)

		expect(log).toHaveBeenCalledTimes(2)
		expect(log).toHaveBeenCalledWith(
			"      ↑ would upload media/shot.png (8 B)"
		)
	})

	it("logs nothing when nothing is pending", async () => {
		const media = await load(BODY, FILES)
		const log = vi.fn()

		logPendingUploads(media, storedFor(media), log)

		expect(log).not.toHaveBeenCalled()
	})
})

// #endregion

// #region uploadPostMedia

describe("uploadPostMedia", () => {
	const BODY = "Intro.\n\n![Shot](media/shot.png)\n\n![Demo](media/demo.mp4)"
	const FILES = { "media/shot.png": PNG, "media/demo.mp4": MP4 }

	it("uploads each file under its key and stores the body with the Blob URLs", async () => {
		const media = await load(BODY, FILES)
		const store = makeStore()
		const stored = await uploadPostMedia({
			store,
			media,
			existing: new Map(),
			log: vi.fn(),
		})
		const shot = media.loaded.get("media/shot.png")
		const demo = media.loaded.get("media/demo.mp4")

		expect(store.put).toHaveBeenCalledTimes(2)
		expect(store.put).toHaveBeenCalledWith(shot?.key, PNG)
		expect(store.put).toHaveBeenCalledWith(demo?.key, MP4)
		expect(stored).toBe(
			`Intro.\n\n![Shot](${STORE}/${shot?.key})\n\n![Demo](${STORE}/${demo?.key})`
		)
	})

	it("leaves no placeholder URL in the stored body", async () => {
		const media = await load(BODY, FILES)
		const stored = await uploadPostMedia({
			store: makeStore(),
			media,
			existing: new Map(),
			log: vi.fn(),
		})

		expect(stored).not.toContain("blob.local")
	})

	it("uploads nothing on a re-run of an unchanged post, and says nothing", async () => {
		const media = await load(BODY, FILES)
		const store = makeStore()
		const log = vi.fn()

		await uploadPostMedia({ store, media, existing: storedFor(media), log })

		expect(store.put).not.toHaveBeenCalled()
		expect(log).not.toHaveBeenCalled()
	})

	it("uploads only the file that changed", async () => {
		const before = await load(BODY, FILES)
		const existing = storedFor(before)
		const after = await load(BODY, { ...FILES, "media/shot.png": OTHER_PNG })
		const store = makeStore()

		await uploadPostMedia({ store, media: after, existing, log: vi.fn() })

		expect(store.put).toHaveBeenCalledTimes(1)
		expect(store.put).toHaveBeenCalledWith(
			after.loaded.get("media/shot.png")?.key,
			OTHER_PNG
		)
	})

	it("logs the upload when something uploads", async () => {
		const media = await load(BODY, FILES)
		const log = vi.fn()

		await uploadPostMedia({
			store: makeStore(),
			media,
			existing: new Map(),
			log,
		})

		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("↑ media/shot.png")
		)
	})

	it("fails when a reused key holds a blob of another size", async () => {
		// The hash-collision backstop must run even when nothing uploads.
		const media = await load(BODY, FILES)
		const existing = storedFor(media)
		const shotKey = media.loaded.get("media/shot.png")?.key ?? ""
		existing.set(shotKey, { url: `${STORE}/${shotKey}`, size: 999 })

		await expect(
			uploadPostMedia({ store: makeStore(), media, existing, log: vi.fn() })
		).rejects.toThrow(/999 B but the local file is 8 B/)
	})

	it("lets an upload failure propagate", async () => {
		const media = await load(BODY, FILES)
		const store = makeStore({
			put: vi.fn(async () => {
				throw new Error("blob store unreachable")
			}),
		})

		await expect(
			uploadPostMedia({ store, media, existing: new Map(), log: vi.fn() })
		).rejects.toThrow("blob store unreachable")
	})

	it("returns a body with no local media as it is, with no Blob call", async () => {
		const body = "Text only."
		const media = await load(body, {})
		const store = makeStore()

		expect(
			await uploadPostMedia({ store, media, existing: new Map(), log: vi.fn() })
		).toBe(body)
		expect(store.put).not.toHaveBeenCalled()
	})
})

// #endregion

// #region planPostImportWithMedia

describe("planPostImportWithMedia", () => {
	const NOW = "2026-10-03-1200"
	const FILES = { "media/shot.png": PNG, "media/demo.mp4": MP4 }
	const MEDIA_BODY =
		"Intro.\n\n![Shot](media/shot.png)\n\n![Demo](media/demo.mp4)"

	/** A parsed post file, as `parsePostFiles` hands it to the plan. */
	function parsedPost(slug: string, body: string) {
		const { parsed, skipped } = parsePostFiles([
			{
				filename: `2026-10-01-0900-${slug}.md`,
				content: setFrontmatterSlug(buildPostFile(`Post ${slug}`, body), slug),
			},
		])

		if (parsed.length !== 1) {
			throw new Error(`Fixture did not parse: ${skipped[0]?.reason}`)
		}

		return parsed[0]
	}

	function existingPost(overrides: Partial<ExistingPost> = {}): ExistingPost {
		return {
			id: 7,
			title: "Post my-post",
			body: "Old body.",
			description: "Old body.",
			datetime: "2026-10-01-0900",
			readingTime: "",
			...overrides,
		}
	}

	type RunOptions = {
		existingBySlug?: Map<string, ExistingPost>
		overwrite?: boolean
		isDryRun?: boolean
		files?: Record<string, Uint8Array>
		listing?: ListedBlob[] | null
		store?: BlobStore
	}

	async function run(
		posts: ReturnType<typeof parsedPost>[],
		options: RunOptions = {}
	) {
		const store = options.store ?? makeStore()
		const listStored =
			options.listing === null ? null : vi.fn(async () => options.listing ?? [])
		const log = vi.fn()
		const result = await planPostImportWithMedia({
			parsed: posts,
			existingBySlug: options.existingBySlug ?? new Map(),
			planOptions: {
				section: "tech",
				now: NOW,
				overwrite: options.overwrite ?? false,
			},
			read: readerOf(options.files ?? FILES),
			store,
			listStored,
			isDryRun: options.isDryRun ?? false,
			log,
		})

		return { result, store, listStored, log }
	}

	/** The plan, failing the test when the run itself failed. */
	function planOf(
		result: Awaited<ReturnType<typeof run>>["result"]
	): ImportPlan {
		if (!result.ok) {
			throw new Error(`Run failed: ${result.reason}`)
		}

		return result.plan
	}

	/** The listing after `body`'s media was uploaded for `slug`. */
	async function listingAfterUpload(
		slug: string,
		body: string
	): Promise<ListedBlob[]> {
		const result = await loadPostMedia({
			body,
			section: "tech",
			slug,
			read: readerOf(FILES),
		})

		if (!result.ok) {
			throw new Error(result.reason)
		}

		return [...result.media.loaded.values()].map((image) =>
			listed(image.key, image.size)
		)
	}

	it("plans a post with no media exactly as the plain plan does, without touching Blob", async () => {
		const { result, store, listStored } = await run([
			parsedPost("plain", "Just text."),
		])
		const plan = planOf(result)

		expect(plan.creates).toHaveLength(1)
		expect(plan.creates[0].body).toBe("Just text.")
		expect(listStored).not.toHaveBeenCalled()
		expect(store.put).not.toHaveBeenCalled()
	})

	it("needs no Blob store for a run of plain posts", async () => {
		const { result } = await run([parsedPost("plain", "Just text.")], {
			listing: null,
		})

		expect(planOf(result).creates).toHaveLength(1)
	})

	it("uploads a new post's media and plans the body with the Blob URLs", async () => {
		const { result, store } = await run([parsedPost("my-post", MEDIA_BODY)])
		const [create] = planOf(result).creates

		expect(store.put).toHaveBeenCalledTimes(2)
		expect(create.body).toContain(`![Shot](${STORE}/posts/tech/my-post/media/`)
		expect(create.body).toContain(`![Demo](${STORE}/posts/tech/my-post/media/`)
		expect(create.body).not.toContain("blob.local")
		expect(create.body).not.toContain("](media/")
	})

	it("lists the store once however many posts carry media", async () => {
		const { listStored } = await run([
			parsedPost("one", "![a](media/shot.png)"),
			parsedPost("two", "![b](media/demo.mp4)"),
		])

		expect(listStored).toHaveBeenCalledTimes(1)
	})

	it("fails with a reason when a post has media and Blob is not configured", async () => {
		const { result, store } = await run([parsedPost("my-post", MEDIA_BODY)], {
			listing: null,
		})

		expect(result).toEqual({
			ok: false,
			reason:
				"1 post(s) reference local media, and the Blob store is not configured",
		})
		expect(store.put).not.toHaveBeenCalled()
	})

	it("uploads nothing on a dry run and shows placeholder URLs", async () => {
		const { result, store } = await run([parsedPost("my-post", MEDIA_BODY)], {
			isDryRun: true,
		})
		const [create] = planOf(result).creates

		expect(store.put).not.toHaveBeenCalled()
		expect(create.body).toContain("https://blob.local/posts/tech/my-post/")
	})

	it("hands back the media and the stored blobs, for the dry run's report", async () => {
		const listing = await listingAfterUpload(
			"my-post",
			"![Shot](media/shot.png)"
		)
		const { result } = await run([parsedPost("my-post", MEDIA_BODY)], {
			isDryRun: true,
			listing,
		})

		if (!result.ok) {
			throw new Error(result.reason)
		}

		const media = result.mediaBySlug.get("my-post")

		expect(media).toBeDefined()
		// The image is stored already; only the video would upload.
		expect(
			media == null ? null : pendingMediaPaths(media, result.stored)
		).toEqual(["media/demo.mp4"])
	})

	it("skips a post whose media file is missing, and still plans the others", async () => {
		const { result, store } = await run([
			parsedPost("broken", "![a](media/missing.png)"),
			parsedPost("fine", "![a](media/shot.png)"),
		])

		if (!result.ok) {
			throw new Error(result.reason)
		}

		expect(result.skipped).toEqual([
			{
				filename: "2026-10-01-0900-broken.md",
				reason: "Media file not found: media/missing.png",
			},
		])
		expect(result.plan.creates.map((create) => create.slug)).toEqual(["fine"])
		expect(store.put).toHaveBeenCalledTimes(1)
	})

	it("never plans a media-skipped post, so no broken reference is stored", async () => {
		const { result } = await run(
			[parsedPost("broken", "![a](media/clip.mov)")],
			{ files: { "media/clip.mov": MP4 } }
		)
		const plan = planOf(result)

		expect(plan.creates).toEqual([])
		expect(plan.updates).toEqual([])
		expect(plan.skipped).toEqual([])
	})

	it("uploads nothing for a post that exists when overwrite is off", async () => {
		const { result, store, listStored } = await run(
			[parsedPost("my-post", MEDIA_BODY)],
			{ existingBySlug: new Map([["my-post", existingPost()]]) }
		)
		const plan = planOf(result)

		expect(store.put).not.toHaveBeenCalled()
		expect(listStored).not.toHaveBeenCalled()
		expect(plan.skipped).toEqual([
			{
				filename: "2026-10-01-0900-my-post.md",
				reason: "A post with this slug already exists (use --overwrite)",
			},
		])
	})

	it("does not skip an existing post for bad media when overwrite is off", async () => {
		// It isn't going to be written, so its media isn't this run's concern.
		const { result } = await run(
			[parsedPost("my-post", "![a](media/gone.png)")],
			{
				existingBySlug: new Map([["my-post", existingPost()]]),
			}
		)

		if (!result.ok) {
			throw new Error(result.reason)
		}

		expect(result.skipped).toEqual([])
	})

	it("uploads nothing for a post the schema refuses", async () => {
		// A description over the cap fails `postFileSchema`.
		const { parsed } = parsePostFiles([
			{
				filename: "2026-10-01-0900-long.md",
				content: `---\ntitle: "Long"\nslug: long\ndescription: "${"x".repeat(161)}"\n---\n\n![a](media/shot.png)`,
			},
		])
		const { result, store } = await run(parsed)

		expect(store.put).not.toHaveBeenCalled()
		expect(planOf(result).skipped).toHaveLength(1)
	})

	it("plans an unchanged post with media as unchanged, and uploads nothing", async () => {
		const listing = await listingAfterUpload("my-post", MEDIA_BODY)
		const first = await run([parsedPost("my-post", MEDIA_BODY)])
		const storedBody = planOf(first.result).creates[0].body

		const { result, store } = await run([parsedPost("my-post", MEDIA_BODY)], {
			existingBySlug: new Map([
				["my-post", existingPost({ body: storedBody })],
			]),
			overwrite: true,
			listing,
		})
		const plan = planOf(result)

		expect(store.put).not.toHaveBeenCalled()
		expect(plan.updates.some((update) => update.data.body != null)).toBe(false)
	})

	it("plans a body update and uploads only the new file when one file's bytes change", async () => {
		const listing = await listingAfterUpload("my-post", MEDIA_BODY)
		const first = await run([parsedPost("my-post", MEDIA_BODY)])
		const storedBody = planOf(first.result).creates[0].body

		const { result, store } = await run([parsedPost("my-post", MEDIA_BODY)], {
			existingBySlug: new Map([
				["my-post", existingPost({ body: storedBody })],
			]),
			overwrite: true,
			listing,
			files: { ...FILES, "media/shot.png": OTHER_PNG },
		})
		const [update] = planOf(result).updates

		expect(store.put).toHaveBeenCalledTimes(1)
		expect(update.data.body).toBeDefined()
		expect(update.data.body).not.toBe(storedBody)
		expect(update.data.body).not.toContain("blob.local")
	})

	it("plans the same writes on a dry run as on a real run", async () => {
		const posts = () => [
			parsedPost("with-media", MEDIA_BODY),
			parsedPost("plain", "Just text."),
		]
		const dry = await run(posts(), { isDryRun: true })
		const real = await run(posts())

		expect(writtenSlugs(planOf(dry.result))).toEqual(
			writtenSlugs(planOf(real.result))
		)
	})

	it("stops the run when the store can't be listed", async () => {
		const result = planPostImportWithMedia({
			parsed: [parsedPost("my-post", MEDIA_BODY)],
			existingBySlug: new Map(),
			planOptions: { section: "tech", now: NOW, overwrite: false },
			read: readerOf(FILES),
			store: makeStore(),
			listStored: async () => {
				throw new Error("list down")
			},
			isDryRun: false,
			log: vi.fn(),
		})

		await expect(result).rejects.toThrow("list down")
	})

	it("stops the run when an upload fails, before any plan is returned", async () => {
		const store = makeStore({
			put: vi.fn(async () => {
				throw new Error("blob store unreachable")
			}),
		})

		await expect(
			run([parsedPost("my-post", MEDIA_BODY)], { store })
		).rejects.toThrow("blob store unreachable")
	})
})

// #endregion

// #region writtenBodies

describe("writtenBodies", () => {
	const plan: ImportPlan = {
		creates: [
			{
				filename: "a.md",
				title: "A",
				slug: "created",
				section: "tech",
				body: "Created body.",
				description: "Created body.",
				datetime: "2026-10-01-0900",
				readingTime: "",
				published: false,
			},
		],
		updates: [
			{ filename: "b.md", id: 1, slug: "body-changed", data: { body: "New." } },
			{ filename: "c.md", id: 2, slug: "title-only", data: { title: "T" } },
		],
		skipped: [],
	}
	const existing = new Map<string, ExistingPost>([
		[
			"title-only",
			{
				id: 2,
				title: "Old",
				body: "Kept body.",
				description: "Kept body.",
				datetime: "2026-10-01-0900",
				readingTime: "",
			},
		],
	])

	it("names every post the plan writes", () => {
		expect(writtenSlugs(plan)).toEqual([
			"created",
			"body-changed",
			"title-only",
		])
	})

	it("takes a create's and a body update's planned body", () => {
		const bodies = writtenBodies(plan, existing, new Set(writtenSlugs(plan)))

		expect(bodies.get("created")).toBe("Created body.")
		expect(bodies.get("body-changed")).toBe("New.")
	})

	it("takes the stored body for an update that leaves the body alone", () => {
		const bodies = writtenBodies(plan, existing, new Set(writtenSlugs(plan)))

		expect(bodies.get("title-only")).toBe("Kept body.")
	})

	it("leaves out a planned create the insert did not write", () => {
		// A concurrent create took the slug: that row is not this run's.
		const bodies = writtenBodies(
			plan,
			existing,
			new Set(["body-changed", "title-only"])
		)

		expect(bodies.has("created")).toBe(false)
		expect(bodies.size).toBe(2)
	})
})

// #endregion

// #region prunePostMedia

describe("prunePostMedia", () => {
	const PREFIX = postMediaPrefixFor("tech", "my-post")
	const kept = listed(`${PREFIX}aaaa-shot.png`)
	const orphan = listed(`${PREFIX}bbbb-old.png`)
	const otherPost = listed("posts/tech/other/cccc-shot.png")
	const BODY = `![Shot](${kept.url})`

	it("deletes what the stored body no longer names, and nothing else", async () => {
		const store = makeStore()
		const pruned = await prunePostMedia({
			store,
			listing: [kept, orphan, otherPost],
			prefix: PREFIX,
			body: BODY,
			isDryRun: false,
			log: vi.fn(),
		})

		expect(pruned).toBe(1)
		expect(store.del).toHaveBeenCalledTimes(1)
		expect(store.del).toHaveBeenCalledWith([orphan.url])
	})

	it("only reports on a dry run", async () => {
		const store = makeStore()
		const log = vi.fn()
		const pruned = await prunePostMedia({
			store,
			listing: [kept, orphan],
			prefix: PREFIX,
			body: BODY,
			isDryRun: true,
			log,
		})

		expect(pruned).toBe(1)
		expect(store.del).not.toHaveBeenCalled()
		expect(log).toHaveBeenCalledWith(`      × would prune ${orphan.pathname}`)
	})

	it("makes no call when nothing is orphaned", async () => {
		const store = makeStore()
		const pruned = await prunePostMedia({
			store,
			listing: [kept, otherPost],
			prefix: PREFIX,
			body: BODY,
			isDryRun: false,
			log: vi.fn(),
		})

		expect(pruned).toBe(0)
		expect(store.del).not.toHaveBeenCalled()
	})

	it("deletes the old version once a post names the new one", async () => {
		// The listing predates the upload, so the new blob isn't in it; the old
		// version is, and the body names only the new one.
		const fresh = `${STORE}/${PREFIX}cccc-shot.png`
		const store = makeStore()

		await prunePostMedia({
			store,
			listing: [kept],
			prefix: PREFIX,
			body: `![Shot](${fresh})`,
			isDryRun: false,
			log: vi.fn(),
		})

		expect(store.del).toHaveBeenCalledWith([kept.url])
	})

	it("lets a delete failure propagate", async () => {
		const store = makeStore({
			del: vi.fn(async () => {
				throw new Error("del down")
			}),
		})

		await expect(
			prunePostMedia({
				store,
				listing: [orphan],
				prefix: PREFIX,
				body: "Text only.",
				isDryRun: false,
				log: vi.fn(),
			})
		).rejects.toThrow("del down")
	})
})

// #endregion
