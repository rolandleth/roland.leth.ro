// Blob-store synchronisation: which images the project importer reuses or
// uploads, which stored blobs are orphans to prune, and the listing and batched
// delete primitives the admin-upload sweep (`uploadPrune.ts`) shares. All I/O
// goes through the injected `BlobStore`, so every branch here is unit-testable
// with in-memory fakes; the scripts wire in the real `@vercel/blob` SDK (and own
// SDK-specific knobs like `allowOverwrite`).

import { blobPrefixFor } from "@/lib/import/projectImport"

/** A blob already in the store, as the reuse and prune paths need it. */
export type StoredBlob = {
	url: string
	size: number
}

export type ListedBlob = StoredBlob & {
	pathname: string
	/** When the blob was written. The upload sweep's grace period reads it. */
	uploadedAt: Date
}

export type BlobListPage = {
	blobs: ListedBlob[]
	cursor?: string
	hasMore: boolean
}

/**
 * The slice of the blob SDK the sync logic depends on. `put` returns only the
 * public URL; access/overwrite options are the adapter's concern.
 */
export type BlobStore = {
	list(options: { prefix: string; cursor?: string }): Promise<BlobListPage>
	put(key: string, body: Uint8Array): Promise<{ url: string }>
	del(urls: string[]): Promise<void>
}

/** A manifest image read from disk, with its content-addressed key. */
export type LoadedImage = {
	buffer: Uint8Array
	size: number
	key: string
}

export type Logger = (line: string) => void

// Parallel uploads per project. Correctness-safe because every pending image
// targets a distinct content-addressed key, so concurrent `put`s can't race
// each other; bounded so a 30-image gallery doesn't open 30 sockets at once.
const UPLOAD_CONCURRENCY = 4

// URLs per `del` call, so a large orphan sweep stays well under any request
// size limit instead of betting on one giant call.
const DELETE_BATCH_SIZE = 50

/**
 * Lists every blob under `prefix` (`""` for the whole store). Walks the
 * paginated `list` to the last page — reading only page one would hide later
 * blobs from every caller: spurious re-uploads on the reuse path, orphans that
 * never get deleted on both prune paths. Errors propagate raw; the caller
 * decides which are fatal.
 */
export async function listBlobs(
	store: Pick<BlobStore, "list">,
	prefix: string
): Promise<ListedBlob[]> {
	const blobs: ListedBlob[] = []
	let cursor: string | undefined

	do {
		const page = await store.list({ prefix, cursor })

		blobs.push(...page.blobs)

		// A page claiming more results without a cursor would otherwise loop
		// forever; treat it as the last page.
		cursor = page.hasMore ? page.cursor : undefined
	} while (cursor != null)

	return blobs
}

/** Every blob under `projects/<slug>/`, keyed by pathname. */
export async function listProjectBlobs(
	store: Pick<BlobStore, "list">,
	slug: string
): Promise<Map<string, StoredBlob>> {
	const blobs = await listBlobs(store, blobPrefixFor(slug))

	return new Map(
		blobs.map((blob) => [blob.pathname, { url: blob.url, size: blob.size }])
	)
}

/**
 * Deletes `blobs` `DELETE_BATCH_SIZE` at a time, logging each pathname with
 * `note` once its batch succeeds — so a failure mid-sweep leaves a log of
 * exactly what went, never a line for a blob that didn't. Errors propagate raw.
 */
export async function deleteBlobs(
	store: Pick<BlobStore, "del">,
	blobs: readonly Pick<ListedBlob, "url" | "pathname">[],
	log: Logger,
	note: string
): Promise<void> {
	for (let start = 0; start < blobs.length; start += DELETE_BATCH_SIZE) {
		const batch = blobs.slice(start, start + DELETE_BATCH_SIZE)

		await store.del(batch.map((blob) => blob.url))

		for (const blob of batch) {
			log(`  × ${blob.pathname} (${note})`)
		}
	}
}

/**
 * Resolves each image to a public Blob URL, uploading only what `existing`
 * doesn't already hold. Keys are content-addressed, so a key present in the
 * store must hold the same bytes — asserted via byte size as a cheap
 * hash-collision backstop, because silently reusing a colliding key would
 * serve wrong content forever. Uploads run `UPLOAD_CONCURRENCY` at a time;
 * after a failure no new uploads start, in-flight ones settle, and the first
 * error is rethrown. Reuses and uploads are both logged, never silent.
 */
export async function syncImages(
	store: BlobStore,
	imagePaths: string[],
	loaded: Map<string, LoadedImage>,
	existing: Map<string, StoredBlob>,
	log: Logger
): Promise<Map<string, string>> {
	const urlByPath = new Map<string, string>()
	const pending: { relativePath: string; image: LoadedImage }[] = []

	for (const relativePath of imagePaths) {
		const image = loaded.get(relativePath)

		if (image == null) {
			throw new Error(`No loaded image for ${relativePath}`)
		}

		const stored = existing.get(image.key)

		if (stored == null) {
			pending.push({ relativePath, image })
			continue
		}

		if (stored.size !== image.size) {
			throw new Error(
				`Stored blob ${image.key} is ${stored.size} B but the local file is ${image.size} B — ` +
					`likely a content-hash collision or a corrupted upload. ` +
					`Re-run with --reupload to overwrite it.`
			)
		}

		urlByPath.set(relativePath, stored.url)
		log(
			`  ↺ ${relativePath} → ${stored.url} (reused, ${formatBytes(image.size)})`
		)
	}

	const errors: unknown[] = []
	let nextIndex = 0

	// Worker pool over a shared index: each worker drains the queue until it's
	// empty or a peer recorded a failure. The index read/increment pair has no
	// await between them, so workers can't double-claim an item.
	const drain = async (): Promise<void> => {
		while (errors.length === 0 && nextIndex < pending.length) {
			const claimed = nextIndex
			nextIndex += 1
			const { relativePath, image } = pending[claimed]

			try {
				const blob = await store.put(image.key, image.buffer)

				urlByPath.set(relativePath, blob.url)
				log(`  ↑ ${relativePath} → ${blob.url} (${formatBytes(image.size)})`)
			} catch (error) {
				errors.push(error)
			}
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pending.length) }, drain)
	)

	if (errors.length > 0) {
		throw errors[0]
	}

	return urlByPath
}

/**
 * Deletes blobs under `projects/<slug>/` that the just-imported project no
 * longer references: earlier content-addressed keys of edited images, legacy
 * pre-content-addressing keys, and strays from imports whose DB write failed.
 * Only call after a successful DB write — the listing says what exists,
 * `referencedUrls` what must survive. Returns the number of blobs deleted.
 * Errors propagate raw; the caller decides whether a failed sweep fails the
 * import (it shouldn't — orphans cost storage, not correctness).
 */
export async function pruneOrphans(
	store: BlobStore,
	slug: string,
	referencedUrls: ReadonlySet<string>,
	log: Logger
): Promise<number> {
	const stored = await listBlobs(store, blobPrefixFor(slug))
	const orphans = stored.filter((blob) => !referencedUrls.has(blob.url))

	await deleteBlobs(store, orphans, log, "pruned")

	return orphans.length
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`
	}

	const kib = bytes / 1024

	return kib < 1024 ? `${kib.toFixed(0)} KiB` : `${(kib / 1024).toFixed(1)} MiB`
}
