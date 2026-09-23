// The steps of the admin-upload sweep and their order, for
// `scripts/prune-uploads.ts`. The script owns the real store, the database
// client and the process. This owns what runs when, so the two rules a slip here
// would break are tested: a dry run never deletes, and a refusal comes before any
// delete. What to delete is decided in `uploadPrune.ts`.

import {
	type BlobStore,
	deleteBlobs,
	formatBytes,
	type ListedBlob,
	listBlobs,
	type Logger,
} from "@/lib/import/blobSync"
import {
	collectReferencedUploadIds,
	planUploadPrune,
	reasonToRefuseApply,
	UPLOAD_GRACE_PERIOD_HOURS,
} from "@/lib/import/uploadPrune"

/** How a run ended. The script turns `"refused"` into a failing exit code. */
export type UploadPruneOutcome =
	"nothing-to-delete" | "refused" | "dry-run" | "deleted"

export interface UploadPruneDeps {
	/** Only the two calls the sweep needs, so a run can't `put`. */
	store: Pick<BlobStore, "list" | "del">
	/** Every row of every model. A skipped table would make its images look orphaned. */
	readRows: () => Promise<readonly object[]>
	log: Logger
	error: Logger
}

export interface UploadPruneOptions {
	isApply: boolean
	now: Date
	/** The database the rows come from, as `describeDatabaseUrl` renders it. */
	databaseTarget: string
}

/**
 * Lists the store, reads the database, and deletes the unreferenced uploads past
 * the grace period — or, without `isApply`, only lists them.
 *
 * Prints both targets first, the database and the blob store, so the operator
 * can see a mismatched pair before anything is deleted. The refusal check runs on
 * a dry run too, so a mismatch shows up before anyone reaches for `--apply`.
 */
export async function runUploadPrune(
	deps: UploadPruneDeps,
	options: UploadPruneOptions
): Promise<UploadPruneOutcome> {
	const { store, readRows, log, error } = deps

	log(
		`${options.isApply ? "" : "DRY RUN — "}pruning unreferenced admin uploads older than ${UPLOAD_GRACE_PERIOD_HOURS}h`
	)
	log(`  database:   ${options.databaseTarget}`)

	const blobs = await listBlobs(store, "")

	log(`  blob store: ${blobStoreHost(blobs)}`)

	const rows = await readRows()
	const plan = planUploadPrune(
		blobs,
		collectReferencedUploadIds(rows),
		options.now
	)
	const uploadCount =
		plan.referenced.length + plan.recent.length + plan.unreferenced.length

	log(
		`\nListed ${blobs.length} blobs, ${uploadCount} of them admin uploads; read ${rows.length} rows.`
	)
	log(`  referenced, kept:        ${plan.referenced.length}`)
	log(
		`  under ${UPLOAD_GRACE_PERIOD_HOURS}h old, kept:     ${plan.recent.length}`
	)
	log(
		`  unreferenced, to delete: ${plan.unreferenced.length} (${totalSize(plan.unreferenced)})`
	)

	if (plan.unreferenced.length === 0) {
		log("\nNothing to delete.")

		return "nothing-to-delete"
	}

	log("")

	for (const blob of plan.unreferenced) {
		log(describeBlob(blob))
	}

	const refusal = reasonToRefuseApply(plan)

	if (refusal != null) {
		error(`\n${refusal}`)

		return "refused"
	}

	if (!options.isApply) {
		log(
			"\nNothing deleted. Run again with --apply to delete the uploads above."
		)

		return "dry-run"
	}

	log("")
	await deleteBlobs(store, plan.unreferenced, log, "deleted")
	log(
		`\nDeleted ${plan.unreferenced.length} uploads, freeing ${totalSize(plan.unreferenced)}.`
	)

	return "deleted"
}

/**
 * The store's host, `<store-id>.public.blob.vercel-storage.com`, read from any
 * blob's URL: every blob in a store shares it, and the id is what tells two
 * stores apart.
 */
function blobStoreHost(blobs: readonly ListedBlob[]): string {
	const first = blobs[0]

	if (first == null) {
		return "(empty store)"
	}

	return URL.parse(first.url)?.host ?? `(unrecognised URL: ${first.url})`
}

function totalSize(blobs: readonly ListedBlob[]): string {
	return formatBytes(blobs.reduce((sum, blob) => sum + blob.size, 0))
}

function describeBlob(blob: ListedBlob): string {
	const uploaded = blob.uploadedAt.toISOString().slice(0, 10)

	return `  - ${blob.pathname}  ${formatBytes(blob.size)}, uploaded ${uploaded}`
}
