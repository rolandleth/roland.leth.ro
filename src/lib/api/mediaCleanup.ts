// Deleting a row's media from Blob once the row itself is deleted. The import
// scripts upload a post's media under `posts/<section>/<slug>/` and a project's
// under `projects/<slug>/`; after an admin delete nothing names those blobs,
// and no later import of that row will run to sweep them.
//
// Files uploaded through the admin (the keys that start with a UUID) are not
// handled here: `yarn blob:prune-uploads` sweeps those once nothing references
// them.

import { blobStore } from "@/lib/import/blobStore"
import { pruneOrphans } from "@/lib/import/blobSync"
import { deletePostMedia } from "@/lib/import/postMediaRun"
import { errorMessage } from "@/lib/utils/errorMessage"
import type { Section } from "@/lib/db/sections"

// The per-blob lines are for a script's terminal. A route logs one summary line.
const silent = (): void => undefined

/** A project that references no image: every blob under its prefix is an orphan. */
const NO_REFERENCES: ReadonlySet<string> = new Set()

/**
 * Deletes a just-deleted post's media. Never throws and never fails the
 * request: the row is gone either way, and a blob left behind costs storage,
 * not correctness. A failure is logged under `tag` so it can be found.
 */
export async function cleanUpPostMedia(
	post: { section: Section; slug: string; body: string },
	tag: string
): Promise<void> {
	await runCleanup(tag, { section: post.section, slug: post.slug }, () =>
		deletePostMedia({ store: blobStore, ...post, log: silent })
	)
}

/** Deletes a just-deleted project's media. Never throws; see `cleanUpPostMedia`. */
export async function cleanUpProjectMedia(
	slug: string,
	tag: string
): Promise<void> {
	await runCleanup(tag, { slug }, () =>
		pruneOrphans(blobStore, slug, NO_REFERENCES, silent)
	)
}

/**
 * Runs one cleanup and logs its outcome: how many blobs went, or why it
 * failed. Silent when there was nothing to delete, the usual case.
 */
async function runCleanup(
	tag: string,
	context: Record<string, string>,
	deleteMedia: () => Promise<number>
): Promise<void> {
	try {
		const count = await deleteMedia()

		if (count > 0) {
			// eslint-disable-next-line no-console
			console.info(`${tag} media deleted`, { ...context, count })
		}
	} catch (error) {
		// eslint-disable-next-line no-console
		console.warn(`${tag} media cleanup failed`, {
			...context,
			message: errorMessage(error),
		})
	}
}
