// Deletes admin uploads that nothing in the database references any more.
//
//   yarn blob:prune-uploads           # dry run: lists what it would delete, deletes nothing
//   yarn blob:prune-uploads --apply   # deletes them
//
// Every admin image field uploads through `POST /api/admin/upload`, and nothing
// deletes the blob when the image is replaced or removed or its row is deleted.
// This sweeps them: it lists the store's admin uploads (`<uuid>-<name>` at the
// root), reads every row of every model, and deletes the uploads whose UUID
// appears nowhere and that are older than the grace period. The rules live in
// `src/lib/import/uploadPrune.ts`.
//
// Deletes are permanent. Always run the dry run first and read the list. `--apply`
// refuses outright when the database references none of the store's uploads,
// which is what a mismatched DATABASE_URL and BLOB_READ_WRITE_TOKEN look like.
//
// It only knows what the database knows. An upload URL pasted into a file that
// hasn't been imported yet looks unreferenced and goes once it's past the grace
// period. Today nothing does that — the content repo's images are static files
// under `public/images/`, not uploads — but import first if that ever changes.
//
// Targets prod by running with prod credentials in the environment
// (`vercel env pull`), same as the importers. The project importer's own
// `projects/<slug>/` blobs are never touched here; it prunes those itself.

import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { del, list } from "@vercel/blob"
import { type Prisma, PrismaClient } from "@/generated/prisma/client"
import {
	type BlobStore,
	deleteBlobs,
	formatBytes,
	type ListedBlob,
	listBlobs,
} from "@/lib/import/blobSync"
import {
	collectReferencedUploadIds,
	planUploadPrune,
	reasonToRefuseApply,
	UPLOAD_GRACE_PERIOD_HOURS,
} from "@/lib/import/uploadPrune"
import { errorMessage } from "@/lib/utils/errorMessage"

// #region CLI

const KNOWN_FLAGS = new Set(["--apply"])

const argv = process.argv.slice(2)
const isApply = argv.includes("--apply")
const unknownArgs = argv.filter((arg) => !KNOWN_FLAGS.has(arg))

// #endregion

// #region I/O

// Only the two calls the sweep needs, so this script can't `put`. The whole store
// is listed (`prefix: ""`); `planUploadPrune` narrows it to admin uploads.
const blobStore: Pick<BlobStore, "list" | "del"> = {
	list: (options) => list(options),
	del: (urls) => del(urls),
}

function makePrisma(): PrismaClient {
	const connectionString = process.env.DATABASE_URL

	if (connectionString == null || connectionString === "") {
		throw new Error(
			"DATABASE_URL is not set. Provide DB credentials before pruning (e.g. `vercel env pull`)."
		)
	}

	return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

/**
 * One full read per model, keyed by every name in `Prisma.ModelName`.
 *
 * The type is what makes this safe to maintain: add a model to the schema and
 * `tsc` fails here until it has a reader, so a new table holding image URLs can't
 * be silently skipped — a skipped table would make its images look unreferenced
 * and get them deleted. A new column on an existing model needs nothing, because
 * `findMany()` with no `select` returns it.
 */
const ROW_READERS: Record<
	Prisma.ModelName,
	(prisma: PrismaClient) => Promise<readonly object[]>
> = {
	Post: (prisma) => prisma.post.findMany(),
	GuideTopic: (prisma) => prisma.guideTopic.findMany(),
	Guide: (prisma) => prisma.guide.findMany(),
	Project: (prisma) => prisma.project.findMany(),
	ProjectSection: (prisma) => prisma.projectSection.findMany(),
	ProjectSectionImage: (prisma) => prisma.projectSectionImage.findMany(),
	ProjectLink: (prisma) => prisma.projectLink.findMany(),
	ProjectFaq: (prisma) => prisma.projectFaq.findMany(),
}

/**
 * Every row of every model. Sequential rather than `Promise.all`: eight reads
 * don't need a pool, and Prisma Postgres rejects bursts of connections.
 */
async function readAllRows(prisma: PrismaClient): Promise<object[]> {
	const rows: object[] = []

	for (const read of Object.values(ROW_READERS)) {
		rows.push(...(await read(prisma)))
	}

	return rows
}

// #endregion

// #region report

function totalSize(blobs: readonly ListedBlob[]): string {
	return formatBytes(blobs.reduce((sum, blob) => sum + blob.size, 0))
}

function describeBlob(blob: ListedBlob): string {
	const uploaded = blob.uploadedAt.toISOString().slice(0, 10)

	return `  - ${blob.pathname}  ${formatBytes(blob.size)}, uploaded ${uploaded}`
}

// #endregion

// #region main

async function main(): Promise<void> {
	if (unknownArgs.length > 0) {
		console.error(
			`Unknown argument(s): ${unknownArgs.join(", ")}. Supported: ${[...KNOWN_FLAGS].join(", ")}.`
		)
		process.exitCode = 1

		return
	}

	// Needed for the dry run too: listing the store is how it knows what exists.
	if (process.env.BLOB_READ_WRITE_TOKEN == null) {
		console.error(
			"BLOB_READ_WRITE_TOKEN is not set. Provide credentials (e.g. `vercel env pull`)."
		)
		process.exitCode = 1

		return
	}

	console.log(
		`${isApply ? "" : "DRY RUN — "}pruning unreferenced admin uploads older than ${UPLOAD_GRACE_PERIOD_HOURS}h`
	)

	const blobs = await listBlobs(blobStore, "")
	const prisma = makePrisma()
	let rows: object[]

	try {
		rows = await readAllRows(prisma)
	} finally {
		await prisma.$disconnect()
	}

	const plan = planUploadPrune(
		blobs,
		collectReferencedUploadIds(rows),
		new Date()
	)
	const uploadCount =
		plan.referenced.length + plan.recent.length + plan.unreferenced.length

	console.log(
		`\nListed ${blobs.length} blobs, ${uploadCount} of them admin uploads; read ${rows.length} rows.`
	)
	console.log(`  referenced, kept:        ${plan.referenced.length}`)
	console.log(
		`  under ${UPLOAD_GRACE_PERIOD_HOURS}h old, kept:     ${plan.recent.length}`
	)
	console.log(
		`  unreferenced, to delete: ${plan.unreferenced.length} (${totalSize(plan.unreferenced)})`
	)

	if (plan.unreferenced.length === 0) {
		console.log("\nNothing to delete.")

		return
	}

	console.log("")

	for (const blob of plan.unreferenced) {
		console.log(describeBlob(blob))
	}

	const refusal = reasonToRefuseApply(plan)

	if (refusal != null) {
		console.error(`\n${refusal}`)
		// A dry run reports it too, so the mismatch shows up before anyone reaches
		// for `--apply`. Failing the exit code keeps it from reading as a clean run.
		process.exitCode = 1

		return
	}

	if (!isApply) {
		console.log(
			"\nNothing deleted. Run again with --apply to delete the uploads above."
		)

		return
	}

	console.log("")
	await deleteBlobs(blobStore, plan.unreferenced, console.log, "deleted")
	console.log(
		`\nDeleted ${plan.unreferenced.length} uploads, freeing ${totalSize(plan.unreferenced)}.`
	)
}

main().catch((error) => {
	console.error(errorMessage(error))
	process.exit(1)
})

// #endregion
