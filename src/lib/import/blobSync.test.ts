import { describe, expect, it, vi } from "vitest"
import {
	type BlobListPage,
	type BlobStore,
	formatBytes,
	listProjectBlobs,
	type LoadedImage,
	pruneOrphans,
	type StoredBlob,
	syncImages,
} from "./blobSync"

type Deferred<T> = {
	promise: Promise<T>
	resolve: (value: T) => void
	reject: (reason: unknown) => void
}

function makeDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void
	let reject!: (reason: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})

	return { promise, resolve, reject }
}

/**
 * In-memory `BlobStore` whose every method is a spy. Defaults: `list` returns
 * one empty page, `put` echoes a URL derived from the key, `del` resolves.
 */
function makeStore(overrides: Partial<BlobStore> = {}): BlobStore {
	return {
		list: vi.fn(async (): Promise<BlobListPage> => ({
			blobs: [],
			hasMore: false,
		})),
		put: vi.fn(async (key: string) => ({ url: `https://store/${key}` })),
		del: vi.fn(async () => undefined),
		...overrides,
	}
}

function image(key: string, size = 4): LoadedImage {
	return { buffer: new Uint8Array(size), size, key }
}

const noopLog = (): void => undefined

// #region listProjectBlobs

describe("listProjectBlobs", () => {
	it("walks every page of a paginated listing", async () => {
		const pages: BlobListPage[] = [
			{
				blobs: [{ pathname: "projects/reckon/a", url: "https://s/a", size: 1 }],
				cursor: "page-2",
				hasMore: true,
			},
			{
				blobs: [{ pathname: "projects/reckon/b", url: "https://s/b", size: 2 }],
				hasMore: false,
			},
		]
		let call = 0
		const store = makeStore({ list: vi.fn(async () => pages[call++]) })

		const result = await listProjectBlobs(store, "reckon")

		// Both pages' blobs must land in the map — reading only page one would
		// hide later blobs from the reuse and prune paths.
		expect(result.get("projects/reckon/a")).toEqual({
			url: "https://s/a",
			size: 1,
		})
		expect(result.get("projects/reckon/b")).toEqual({
			url: "https://s/b",
			size: 2,
		})
		expect(store.list).toHaveBeenNthCalledWith(1, {
			prefix: "projects/reckon/",
			cursor: undefined,
		})
		expect(store.list).toHaveBeenNthCalledWith(2, {
			prefix: "projects/reckon/",
			cursor: "page-2",
		})
	})

	it("stops after the last page", async () => {
		const store = makeStore()

		await listProjectBlobs(store, "reckon")

		expect(store.list).toHaveBeenCalledTimes(1)
	})

	it("treats hasMore without a cursor as the last page instead of looping", async () => {
		const store = makeStore({
			list: vi.fn(async () => ({ blobs: [], hasMore: true })),
		})

		await listProjectBlobs(store, "reckon")

		expect(store.list).toHaveBeenCalledTimes(1)
	})

	it("propagates list errors raw", async () => {
		const store = makeStore({
			list: vi.fn(async () => {
				throw new Error("list down")
			}),
		})

		await expect(listProjectBlobs(store, "reckon")).rejects.toThrow("list down")
	})
})

// #endregion

// #region syncImages

describe("syncImages", () => {
	it("reuses an existing key with a matching size without uploading", async () => {
		const store = makeStore()
		const existing = new Map<string, StoredBlob>([
			["projects/r/k1", { url: "https://s/k1", size: 4 }],
		])
		const log = vi.fn()

		const urls = await syncImages(
			store,
			["a.png"],
			new Map([["a.png", image("projects/r/k1")]]),
			existing,
			log
		)

		expect(urls.get("a.png")).toBe("https://s/k1")
		expect(store.put).not.toHaveBeenCalled()
		// Reuse is never silent, and the restored size column keeps per-image
		// audit possible on large galleries.
		expect(log).toHaveBeenCalledWith(expect.stringContaining("reused, 4 B"))
	})

	it("throws on a size mismatch instead of silently reusing wrong bytes", async () => {
		// Same key + different size means a content-hash collision or a corrupt
		// upload — the one case where "same key ⇒ same bytes" would silently
		// serve wrong content.
		const store = makeStore()
		const existing = new Map<string, StoredBlob>([
			["projects/r/k1", { url: "https://s/k1", size: 999 }],
		])

		await expect(
			syncImages(
				store,
				["a.png"],
				new Map([["a.png", image("projects/r/k1")]]),
				existing,
				noopLog
			)
		).rejects.toThrow(/collision|corrupted/i)
		expect(store.put).not.toHaveBeenCalled()
	})

	it("uploads keys the store doesn't hold and maps their URLs", async () => {
		const store = makeStore()
		const log = vi.fn()

		const urls = await syncImages(
			store,
			["a.png"],
			new Map([["a.png", image("projects/r/k1")]]),
			new Map(),
			log
		)

		expect(store.put).toHaveBeenCalledWith(
			"projects/r/k1",
			expect.any(Uint8Array)
		)
		expect(urls.get("a.png")).toBe("https://store/projects/r/k1")
		expect(log).toHaveBeenCalledWith(expect.stringContaining("4 B"))
	})

	it("throws when an image path has no loaded entry", async () => {
		await expect(
			syncImages(makeStore(), ["a.png"], new Map(), new Map(), noopLog)
		).rejects.toThrow(/no loaded image/i)
	})

	it("caps uploads at 4 in flight and feeds the pool as slots free up", async () => {
		const deferredByKey = new Map<string, Deferred<{ url: string }>>()
		const store = makeStore({
			put: vi.fn((key: string) => {
				const deferred = makeDeferred<{ url: string }>()
				deferredByKey.set(key, deferred)

				return deferred.promise
			}),
		})
		const paths = ["1", "2", "3", "4", "5", "6"]
		const loaded = new Map(paths.map((p) => [p, image(`k${p}`)]))

		const promise = syncImages(store, paths, loaded, new Map(), noopLog)

		// Only the first four start; the pool is bounded.
		expect(store.put).toHaveBeenCalledTimes(4)

		deferredByKey.get("k1")!.resolve({ url: "https://s/k1" })
		await Promise.resolve()

		// A freed worker claims the fifth.
		expect(store.put).toHaveBeenCalledTimes(5)

		for (const p of ["2", "3", "4", "5", "6"]) {
			deferredByKey.get(`k${p}`)?.resolve({ url: `https://s/k${p}` })
			await Promise.resolve()
		}

		const urls = await promise
		expect(urls.size).toBe(6)
	})

	it("starts no new uploads after a failure, settles in-flight ones, and rethrows", async () => {
		// Image 3-of-6 failing mid-batch is the consequential path: uploads run
		// before the DB write, so anything already uploaded is a stray until the
		// next successful import prunes it — but nothing beyond the in-flight
		// window may start.
		const deferredByKey = new Map<string, Deferred<{ url: string }>>()
		const store = makeStore({
			put: vi.fn((key: string) => {
				const deferred = makeDeferred<{ url: string }>()
				deferredByKey.set(key, deferred)

				return deferred.promise
			}),
		})
		const paths = ["1", "2", "3", "4", "5", "6"]
		const loaded = new Map(paths.map((p) => [p, image(`k${p}`)]))

		const promise = syncImages(store, paths, loaded, new Map(), noopLog)
		const rejection = expect(promise).rejects.toThrow("k3 boom")

		deferredByKey.get("k3")!.reject(new Error("k3 boom"))
		await Promise.resolve()

		for (const p of ["1", "2", "4"]) {
			deferredByKey.get(`k${p}`)!.resolve({ url: `https://s/k${p}` })
		}

		await rejection
		// 5 and 6 must never have started once the failure was recorded.
		expect(store.put).toHaveBeenCalledTimes(4)
	})
})

// #endregion

// #region pruneOrphans

describe("pruneOrphans", () => {
	it("deletes only blobs the project no longer references", async () => {
		const store = makeStore({
			list: vi.fn(async () => ({
				blobs: [
					{ pathname: "projects/r/keep", url: "https://s/keep", size: 1 },
					{ pathname: "projects/r/orphan", url: "https://s/orphan", size: 1 },
				],
				hasMore: false,
			})),
		})
		const log = vi.fn()

		const pruned = await pruneOrphans(
			store,
			"r",
			new Set(["https://s/keep"]),
			log
		)

		expect(pruned).toBe(1)
		expect(store.del).toHaveBeenCalledTimes(1)
		expect(store.del).toHaveBeenCalledWith(["https://s/orphan"])
		// Deletions are logged per blob, never silent.
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("projects/r/orphan")
		)
	})

	it("makes no delete call when nothing is orphaned", async () => {
		const store = makeStore({
			list: vi.fn(async () => ({
				blobs: [
					{ pathname: "projects/r/keep", url: "https://s/keep", size: 1 },
				],
				hasMore: false,
			})),
		})

		const pruned = await pruneOrphans(
			store,
			"r",
			new Set(["https://s/keep"]),
			noopLog
		)

		expect(pruned).toBe(0)
		expect(store.del).not.toHaveBeenCalled()
	})

	it("deletes large sweeps in batches", async () => {
		const blobs = Array.from({ length: 120 }, (_, index) => ({
			pathname: `projects/r/orphan-${index}`,
			url: `https://s/orphan-${index}`,
			size: 1,
		}))
		const store = makeStore({
			list: vi.fn(async () => ({ blobs, hasMore: false })),
		})

		const pruned = await pruneOrphans(store, "r", new Set(), noopLog)

		expect(pruned).toBe(120)
		// 50 per call: 50 + 50 + 20.
		expect(store.del).toHaveBeenCalledTimes(3)
		expect(vi.mocked(store.del).mock.calls[2][0]).toHaveLength(20)
	})
})

// #endregion

// #region formatBytes

describe("formatBytes", () => {
	it("formats bytes, KiB, and MiB at their thresholds", () => {
		expect(formatBytes(512)).toBe("512 B")
		expect(formatBytes(2048)).toBe("2 KiB")
		expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MiB")
	})
})

// #endregion
