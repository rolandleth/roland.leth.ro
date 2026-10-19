// The I/O half of post media, with the I/O injected: reading a post's media
// files, resolving each to a Blob URL, and sweeping what a post no longer uses.
// `scripts/import-posts.ts` passes in the file system and the real Blob store;
// the tests pass in-memory fakes. The decisions live in `postMedia.ts`.

import { type Section, SECTIONS } from "@/lib/db/sections"
import {
	type BlobStore,
	deleteBlobs,
	formatBytes,
	listBlobs,
	type ListedBlob,
	type LoadedImage,
	type Logger,
	type StoredBlob,
	storedBlobsByKey,
	syncImages,
} from "@/lib/import/blobSync"
import {
	type ExistingPost,
	type ImportPlan,
	type ParsedPostFile,
	planPostImport,
	type SkippedFile,
} from "@/lib/import/postImport"
import {
	type LocalMediaRef,
	localMediaPaths,
	mediaFileProblem,
	orphanedPostMedia,
	postMediaKeyFor,
	postMediaPrefixFor,
	rewriteLocalMedia,
	scanLocalMedia,
} from "@/lib/import/postMedia"
import { contentHashFor, placeholderBlobUrl } from "@/lib/import/projectImport"
import { errorMessage } from "@/lib/utils/errorMessage"

/**
 * Reads one media file by its path relative to the post's folder. Resolves to
 * `null` when there is no such file; any other failure rejects.
 */
export type MediaReader = (relativePath: string) => Promise<Uint8Array | null>

/** A post's local media, read and keyed, ready to resolve to URLs. */
export type LoadedPostMedia = {
	/**
	 * The body as the file wrote it. Kept with the references because their
	 * offsets only mean something in this exact text.
	 */
	body: string
	refs: LocalMediaRef[]
	/** The distinct files, in first-seen order. Empty for a body with no local media. */
	paths: string[]
	/** Each file's bytes and content-addressed key, by path. */
	loaded: Map<string, LoadedImage>
}

export type PostMediaLoad =
	{ ok: true; media: LoadedPostMedia } | { ok: false; reason: string }

const silent: Logger = () => undefined

/**
 * Reads every local media file `body` references and keys it by its content.
 * Uploads nothing. Fails with a reason the importer prints as the post's skip
 * line: a path the scan refuses, a file that isn't there, a file of the wrong
 * kind. A post with one bad file imports nothing, so it is never stored with a
 * reference that resolves to nothing.
 */
export async function loadPostMedia(options: {
	body: string
	section: Section
	slug: string
	read: MediaReader
}): Promise<PostMediaLoad> {
	const { body, section, slug, read } = options
	const scan = scanLocalMedia(body)

	if (!scan.ok) {
		return scan
	}

	const paths = localMediaPaths(scan.refs)
	const loaded = new Map<string, LoadedImage>()

	for (const relativePath of paths) {
		const bytes = await read(relativePath)

		if (bytes == null) {
			return { ok: false, reason: `Media file not found: ${relativePath}` }
		}

		const problem = mediaFileProblem(relativePath, bytes)

		if (problem != null) {
			return { ok: false, reason: problem }
		}

		loaded.set(relativePath, {
			buffer: bytes,
			size: bytes.length,
			key: postMediaKeyFor(section, slug, relativePath, contentHashFor(bytes)),
		})
	}

	return { ok: true, media: { body, refs: scan.refs, paths, loaded } }
}

/**
 * The files of `media` that the store does not hold yet. Keys are
 * content-addressed, so a key in `existing` is the same bytes already uploaded.
 */
export function pendingMediaPaths(
	media: LoadedPostMedia,
	existing: ReadonlyMap<string, StoredBlob>
): string[] {
	return media.paths.filter((relativePath) => {
		const image = media.loaded.get(relativePath)

		return image != null && !existing.has(image.key)
	})
}

/**
 * The body as it would be stored, without uploading: a file the store already
 * holds gets its real URL, one it doesn't gets a placeholder URL. For the dry
 * run, and for checking a post against the schema before spending an upload on
 * it. When nothing is pending this is exactly the body a real run stores, which
 * is how an unchanged post is recognized as unchanged.
 */
export function previewPostBody(
	media: LoadedPostMedia,
	existing: ReadonlyMap<string, StoredBlob>
): string {
	const urlByPath = new Map<string, string>()

	for (const [relativePath, image] of media.loaded) {
		urlByPath.set(
			relativePath,
			existing.get(image.key)?.url ?? placeholderBlobUrl(image.key)
		)
	}

	return rewriteLocalMedia(media.body, media.refs, urlByPath)
}

/**
 * Uploads the files the store doesn't hold and returns the body with every
 * local reference replaced by its Blob URL. Reused files stay quiet unless
 * something uploads alongside them; then the whole post's media is logged.
 *
 * Always goes through `syncImages`, even with nothing to upload, for its size
 * check on reused keys: a stored blob of another size under the same content
 * hash must fail the run, not be linked.
 */
export async function uploadPostMedia(options: {
	store: BlobStore
	media: LoadedPostMedia
	existing: Map<string, StoredBlob>
	log: Logger
}): Promise<string> {
	const { store, media, existing, log } = options
	const hasPending = pendingMediaPaths(media, existing).length > 0
	const urlByPath = await syncImages(
		store,
		media.paths,
		media.loaded,
		existing,
		hasPending ? log : silent,
		POST_MEDIA_COLLISION_FIX
	)

	return rewriteLocalMedia(media.body, media.refs, urlByPath)
}

/**
 * What a size mismatch on a stored post file tells the author to do.
 * `db:import-posts` has no `--reupload`, and no upload would replace the blob
 * anyway: the key comes from the bytes, so it has to go first.
 */
export const POST_MEDIA_COLLISION_FIX =
	"Delete that blob from the Blob store, then re-run the import."

export type MediaImportPlan =
	| {
			ok: true
			/**
			 * The plan to write. On a real run its bodies are the stored ones, Blob
			 * URLs in place; on a dry run a file not uploaded yet shows a placeholder
			 * URL, and nothing is written.
			 */
			plan: ImportPlan
			/** Files left out because of their media, each with its reason. */
			skipped: SkippedFile[]
			/** The media of every post that has some and could be written, by slug. */
			mediaBySlug: Map<string, LoadedPostMedia>
			/** What the store held before the run, by key. Empty when no post has media. */
			stored: Map<string, StoredBlob>
	  }
	| { ok: false; reason: string }

/**
 * `planPostImport` for files that may reference local media.
 *
 * Plans twice. The first plan runs on preview bodies and decides which posts
 * are written, so that only those upload anything: a post that already exists
 * without `--overwrite`, one the schema refuses and one that is unchanged all
 * upload nothing. A post whose media is all stored previews to exactly its
 * stored body, which is how it plans as unchanged. The second plan runs on the
 * bodies as stored after the uploads, so the description and the reading time
 * come from what is actually written.
 *
 * A dry run stops after the first plan and uploads nothing.
 *
 * `listStored` is called at most once, and only when a post that could be
 * written has local media; a run over plain posts never touches Blob. Pass
 * `null` when Blob is not configured: that fails, with a reason, only if a
 * post needs it.
 */
export async function planPostImportWithMedia(options: {
	parsed: readonly ParsedPostFile[]
	existingBySlug: ReadonlyMap<string, ExistingPost>
	planOptions: { section: Section; now: string; overwrite: boolean }
	read: MediaReader
	store: BlobStore
	listStored: (() => Promise<readonly ListedBlob[]>) | null
	isDryRun: boolean
	log: Logger
}): Promise<MediaImportPlan> {
	const { parsed, existingBySlug, planOptions, read, store, isDryRun, log } =
		options
	const { mediaBySlug, skipped } = await loadCandidateMedia(
		parsed,
		existingBySlug,
		planOptions,
		read
	)

	if (mediaBySlug.size > 0 && options.listStored == null) {
		return {
			ok: false,
			reason: `${mediaBySlug.size} post(s) reference local media, and the Blob store is not configured`,
		}
	}

	const stored = storedBlobsByKey(
		mediaBySlug.size > 0 && options.listStored != null
			? await options.listStored()
			: []
	)

	const skippedFilenames = new Set(skipped.map((skip) => skip.filename))
	const importable = parsed.filter(
		(file) => !skippedFilenames.has(file.filename)
	)
	const previewBodies = new Map<string, string>()

	for (const [slug, media] of mediaBySlug) {
		previewBodies.set(slug, previewPostBody(media, stored))
	}

	const previewPlan = planPostImport(
		withBodies(importable, previewBodies),
		existingBySlug,
		planOptions
	)

	if (isDryRun) {
		return { ok: true, plan: previewPlan, skipped, mediaBySlug, stored }
	}

	const storedBodies = new Map(previewBodies)

	for (const slug of writtenSlugs(previewPlan)) {
		const media = mediaBySlug.get(slug)

		if (media != null) {
			storedBodies.set(
				slug,
				await uploadPostMedia({ store, media, existing: stored, log })
			)
		}
	}

	return {
		ok: true,
		plan: planPostImport(
			withBodies(importable, storedBodies),
			existingBySlug,
			planOptions
		),
		skipped,
		mediaBySlug,
		stored,
	}
}

/**
 * The body each post in `writtenSlugs` ends up with: the planned body, or the
 * stored one for an update that leaves the body alone. This is what the sweep
 * of old media checks a post's blobs against.
 */
export function writtenBodies(
	plan: ImportPlan,
	existingBySlug: ReadonlyMap<string, ExistingPost>,
	slugs: ReadonlySet<string>
): Map<string, string> {
	const bodies = new Map<string, string>()

	for (const create of plan.creates) {
		if (slugs.has(create.slug)) {
			bodies.set(create.slug, create.body)
		}
	}

	for (const update of plan.updates) {
		const body = update.data.body ?? existingBySlug.get(update.slug)?.body

		if (slugs.has(update.slug) && body != null) {
			bodies.set(update.slug, body)
		}
	}

	return bodies
}

/** The slug of every post `plan` writes. */
export function writtenSlugs(plan: ImportPlan): string[] {
	return [
		...plan.creates.map((create) => create.slug),
		...plan.updates.map((update) => update.slug),
	]
}

/**
 * Reads the local media of every file the plan could write: a new slug, or a
 * known one under `overwrite`. A file whose post exists and won't be
 * overwritten is left alone; the plan skips it whatever its media. Touches the
 * reader only, never Blob.
 */
async function loadCandidateMedia(
	parsed: readonly ParsedPostFile[],
	existingBySlug: ReadonlyMap<string, ExistingPost>,
	planOptions: { section: Section; overwrite: boolean },
	read: MediaReader
): Promise<{
	mediaBySlug: Map<string, LoadedPostMedia>
	skipped: SkippedFile[]
}> {
	const mediaBySlug = new Map<string, LoadedPostMedia>()
	const skipped: SkippedFile[] = []

	for (const file of parsed) {
		if (existingBySlug.has(file.slug) && !planOptions.overwrite) {
			continue
		}

		const result = await loadPostMedia({
			body: file.body,
			section: planOptions.section,
			slug: file.slug,
			read,
		})

		if (!result.ok) {
			skipped.push({ filename: file.filename, reason: result.reason })
		} else if (result.media.paths.length > 0) {
			mediaBySlug.set(file.slug, result.media)
		}
	}

	return { mediaBySlug, skipped }
}

/** `files` with each listed slug's body swapped for the one in `bodyBySlug`. */
function withBodies(
	files: readonly ParsedPostFile[],
	bodyBySlug: ReadonlyMap<string, string>
): ParsedPostFile[] {
	return files.map((file) => {
		const body = bodyBySlug.get(file.slug)

		return body == null ? file : { ...file, body }
	})
}

/** One line per file a real run would upload for this post. */
export function logPendingUploads(
	media: LoadedPostMedia,
	existing: ReadonlyMap<string, StoredBlob>,
	log: Logger
): void {
	for (const relativePath of pendingMediaPaths(media, existing)) {
		const size = media.loaded.get(relativePath)?.size ?? 0

		log(`      ↑ would upload ${relativePath} (${formatBytes(size)})`)
	}
}

/**
 * Which of `urls` some other post's body still names (`namedByOtherPosts` in
 * `@/lib/db/postMediaReferences` is the database's). A blob under a post's
 * prefix isn't that post's alone: a post whose section changed after its import
 * keeps linking to the old section's prefix, a new post can take the same slug
 * there, and content-addressed keys let two posts share one URL. Every media
 * delete asks this first and keeps what it returns. Rejecting means nothing is
 * deleted.
 */
export type NamedElsewhere = (
	urls: readonly string[]
) => Promise<ReadonlySet<string>>

/**
 * `blobs` less the ones another post names, logging each one kept. Asks once,
 * and not at all for an empty list.
 */
async function withoutBlobsNamedElsewhere(
	blobs: ListedBlob[],
	namedElsewhere: NamedElsewhere,
	log: Logger
): Promise<ListedBlob[]> {
	if (blobs.length === 0) {
		return blobs
	}

	const named = await namedElsewhere(blobs.map((blob) => blob.url))

	return blobs.filter((blob) => {
		if (!named.has(blob.url)) {
			return true
		}

		log(`      · kept ${blob.pathname}: another post names it`)

		return false
	})
}

/**
 * Deletes the blobs under a post's `prefix` that its stored `body` no longer
 * names and no other post names (`NamedElsewhere`), or only reports them on a
 * dry run. Returns how many. Only call it for a post whose write succeeded:
 * `listing` says what existed before the run, and `body` what must survive.
 * Errors propagate raw; the caller decides whether a failed sweep fails the
 * import (it shouldn't: orphans cost storage, not correctness).
 */
export async function prunePostMedia(options: {
	store: Pick<BlobStore, "del">
	listing: readonly ListedBlob[]
	prefix: string
	body: string
	namedElsewhere: NamedElsewhere
	isDryRun: boolean
	log: Logger
}): Promise<number> {
	const { store, listing, prefix, body, namedElsewhere, isDryRun, log } =
		options
	const orphans = await withoutBlobsNamedElsewhere(
		orphanedPostMedia(listing, prefix, body),
		namedElsewhere,
		log
	)

	if (isDryRun) {
		for (const orphan of orphans) {
			log(`      × would prune ${orphan.pathname}`)
		}
	} else {
		await deleteBlobs(store, orphans, log, "pruned")
	}

	return orphans.length
}

/**
 * The importer's sweep of old media, after its write: for each written post,
 * the blobs it no longer names and no other post names go (`prunePostMedia`),
 * or on a dry run are only reported.
 *
 * Lists the store only when there is a post to sweep. The listing is
 * best-effort: none (no token, `getListing` null) or a failed one skips the
 * sweep with a warning, and a post whose sweep fails warns and the next one
 * goes on. The rows are already written, and an orphan costs storage, not
 * correctness.
 *
 * @param namedElsewhereFor The cross-post check for one post, leaving that
 *   post out of it (`namedByOtherPosts`).
 */
export async function sweepWrittenPostMedia(options: {
	store: Pick<BlobStore, "del">
	bodyBySlug: ReadonlyMap<string, string>
	getListing: (() => Promise<ListedBlob[]>) | null
	section: Section
	namedElsewhereFor: (slug: string) => NamedElsewhere
	isDryRun: boolean
	log: Logger
	warn: Logger
}): Promise<void> {
	const { store, bodyBySlug, getListing, section, isDryRun, log, warn } =
		options

	if (bodyBySlug.size === 0 || getListing == null) {
		return
	}

	let listing: ListedBlob[]

	try {
		listing = await getListing()
	} catch (error) {
		warn(
			`  ! couldn't list stored media (${errorMessage(error)}); skipping the sweep of old media`
		)

		return
	}

	for (const [slug, body] of bodyBySlug) {
		try {
			await prunePostMedia({
				store,
				listing,
				prefix: postMediaPrefixFor(section, slug),
				body,
				namedElsewhere: options.namedElsewhereFor(slug),
				isDryRun,
				log,
			})
		} catch (error) {
			warn(
				`  ! couldn't prune old media for ${slug} (${errorMessage(error)}); it remains in the store`
			)
		}
	}
}

/**
 * Deletes the media of a post that was just deleted, and returns how many
 * blobs went. Everything under the post's own prefix goes, stale versions
 * included, unless another post names it (`NamedElsewhere`).
 *
 * A post whose section was changed in the admin after its import still has its
 * media under the old section's prefix. That prefix can also belong to a
 * different post, since a slug is only unique within its section. So under
 * another section's prefix for the same slug, only the blobs the deleted body
 * names are candidates. The same goes the other way: a post moved into this
 * section and given this slug's prefix's media keeps it, through the check.
 *
 * Only call it once the row is gone, so the check can't count the deleted post
 * itself. Errors propagate raw; the caller decides what a failed cleanup means
 * (the row is deleted either way).
 */
export async function deletePostMedia(options: {
	store: Pick<BlobStore, "list" | "del">
	section: Section
	slug: string
	body: string
	namedElsewhere: NamedElsewhere
	log: Logger
}): Promise<number> {
	const { store, section, slug, body, namedElsewhere, log } = options
	const candidates: ListedBlob[] = []

	for (const candidate of SECTIONS) {
		const blobs = await listBlobs(store, postMediaPrefixFor(candidate, slug))

		candidates.push(
			...(candidate === section
				? blobs
				: blobs.filter((blob) => body.includes(blob.url)))
		)
	}

	const doomed = await withoutBlobsNamedElsewhere(
		candidates,
		namedElsewhere,
		log
	)

	await deleteBlobs(store, doomed, log, "deleted")

	return doomed.length
}
