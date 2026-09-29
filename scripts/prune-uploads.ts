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
// `src/lib/import/uploadPrune.ts`, the steps in `src/lib/import/uploadPruneRun.ts`.
//
// Deletes are permanent. Always run the dry run first and read the list, and the
// database and blob store it prints first. `--apply` refuses outright when the
// uploads it would delete outnumber the ones the database references, which is
// what a mismatched DATABASE_URL and BLOB_READ_WRITE_TOKEN look like.
//
// It only knows what the database knows. An upload URL pasted into a file that
// hasn't been imported yet looks unreferenced and goes once it's past the grace
// period. Today nothing does that — the content repo's images are static files
// under `public/images/`, not uploads — but import first if that ever changes.
//
// Targets prod by running with prod credentials in `.env`, same as the
// importers (see `SCRIPT_CREDENTIALS_HINT`). The project importer's own
// `projects/<slug>/` blobs are never touched here; it prunes those itself.

import "dotenv/config"
import { del, list } from "@vercel/blob"
import { type Prisma, PrismaClient } from "@/generated/prisma/client"
import { makeScriptPrisma } from "@/lib/db/scriptPrisma"
import { type BlobStore } from "@/lib/import/blobSync"
import { parseScriptArgs } from "@/lib/import/cliArgs"
import {
	describeDatabaseUrl,
	readScriptEnv,
	SCRIPT_CREDENTIALS_HINT,
} from "@/lib/import/scriptEnv"
import { runUploadPrune } from "@/lib/import/uploadPruneRun"
import { errorMessage } from "@/lib/utils/errorMessage"

// #region CLI

const cli = parseScriptArgs(process.argv.slice(2), {
	command: "yarn blob:prune-uploads",
	positionals: { count: "none" },
	knownFlags: new Set(["--apply"]),
})
const isApply = cli.flags.has("--apply")

// #endregion

// #region I/O

// Only the two calls the sweep needs, so this script can't `put`. The whole store
// is listed (`prefix: ""`); `planUploadPrune` narrows it to admin uploads.
const blobStore: Pick<BlobStore, "list" | "del"> = {
	list: (options) => list(options),
	del: (urls) => del(urls),
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

// #region main

async function main(): Promise<void> {
	if (cli.problem != null) {
		console.error(cli.problem)
		process.exitCode = 1

		return
	}

	// Needed for the dry run too: listing the store is how it knows what exists.
	if (readScriptEnv("BLOB_READ_WRITE_TOKEN") == null) {
		console.error(
			`BLOB_READ_WRITE_TOKEN is not set. ${SCRIPT_CREDENTIALS_HINT}`
		)
		process.exitCode = 1

		return
	}

	// Built before the store is listed, so a missing DATABASE_URL stops the run
	// before any work rather than after a full listing. It throws when unset.
	const prisma = makeScriptPrisma()
	const databaseTarget =
		describeDatabaseUrl(readScriptEnv("DATABASE_URL") ?? "") ??
		"(DATABASE_URL isn't a URL)"

	try {
		const outcome = await runUploadPrune(
			{
				store: blobStore,
				readRows: () => readAllRows(prisma),
				log: console.log,
				error: console.error,
			},
			{ isApply, now: new Date(), databaseTarget }
		)

		// A refusal on a dry run fails the exit code too, so it can't read as a
		// clean run.
		if (outcome === "refused") {
			process.exitCode = 1
		}
	} finally {
		await prisma.$disconnect()
	}
}

main().catch((error) => {
	console.error(errorMessage(error))
	process.exit(1)
})

// #endregion
