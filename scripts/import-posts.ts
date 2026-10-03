// Post importer: bulk-loads markdown files (`yyyy-MM-dd[-HHmm]-Title.md`) from
// a folder into the posts table, optionally overwriting existing rows.
//
//   yarn db:import-posts ../blog/tech                 # create-only; section from folder name
//   yarn db:import-posts ../blog/tech --overwrite     # also update existing slugs in place
//   yarn db:import-posts ../blog/life --dry-run       # report the plan, write nothing
//   yarn db:import-posts /some/folder --section=tech        # explicit section override
//
// Reads only the folder's direct `*.md` files — a `drafts/` subfolder never
// imports. The filename carries datetime + title (same convention as the admin
// bulk picker); a first line equal to the title is stripped from the body (the
// content repo keeps the title as the file's first line).
//
// The slug comes from `slug:` frontmatter, and a file without one is skipped:
// no slug is derived from the title. A non-canonical value gets the normalized
// slug written back into the source file (atomically) before any DB work — the
// one write this script does outside the DB. Dry runs report the pending
// write-backs without touching anything.
//
// The slug write-back runs BEFORE the plan decides what to import, so a file
// whose body the plan later skips (schema-invalid: oversized, empty section)
// still gets its `slug:` stamped. That's intentional convergence, not a bug:
// the slug is a property of the file, correct whether or not the body imports
// today; you fix the body and re-run, and the already-explicit slug is a no-op.
// A single write-back failure is reported and the run continues (non-zero exit)
// rather than aborting the whole batch — the resolved slug is still applied in
// the DB from memory; only the on-disk backfill is deferred to the next run.
//
// Media: an image-syntax path with no scheme and no leading `/` names a file
// relative to the folder (`![Demo](media/my-post/demo.mp4)`). Each such image or
// video is uploaded to Blob under `posts/<section>/<slug>/`, keyed by its
// content, and the stored body carries the Blob URL; the file keeps the relative
// path. Only posts the run writes upload anything, a re-run reuses what is
// stored, and after the DB write the blobs a written post no longer names are
// deleted. A post with a missing or unsupported media file is skipped whole.
// `https://…` and `/images/…` destinations are left as they are. Needs
// BLOB_READ_WRITE_TOKEN as soon as one post has local media.
//
// Creates follow the bulk endpoint's rule: future-dated files import as
// published (scheduled), past-dated as drafts. Overwrites refresh title, body,
// datetime, and reading time, PRESERVE `published`, and write `description`
// only when the file carries one that differs from the stored value, or when
// the stored one was itself derived and the body changed — a description
// authored in the admin survives an overwrite from a file without one. It's the
// admin edit route's rule too (`descriptionForUpdate`).
// Unchanged files plan zero writes, so re-runs are idempotent.
//
// Direct Prisma writes: this deliberately skips the admin API, so it cannot
// bust the site's caches. After a run with writes, hit "Revalidate caches" in
// the admin nav so the changes surface.
//
// Targets prod by running with prod credentials (DATABASE_URL) in `.env`, the
// one file the scripts load; see `SCRIPT_CREDENTIALS_HINT`. Always `--dry-run`
// first.

import "dotenv/config"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { Prisma } from "@/generated/prisma/client"
import { makeScriptPrisma } from "@/lib/db/scriptPrisma"
import {
	applySlugRewrites,
	type SlugRewriteOutcome,
} from "@/lib/import/applySlugRewrites"
import { blobStore } from "@/lib/import/blobStore"
import { listBlobs, type ListedBlob } from "@/lib/import/blobSync"
import { readFileInFolder } from "@/lib/import/localFiles"
import { sortedMarkdownNames } from "@/lib/import/markdownFiles"
import {
	diffBodyLines,
	type ExistingPost,
	type ImportFile,
	type ImportPlan,
	parsePostFiles,
	type PlannedCreate,
	type PlannedUpdate,
	type SkippedFile,
	UNCHANGED_SKIP_REASON,
} from "@/lib/import/postImport"
import {
	postMediaPrefixFor,
	postMediaSectionPrefix,
} from "@/lib/import/postMedia"
import {
	logPendingUploads,
	planPostImportWithMedia,
	prunePostMedia,
	writtenBodies,
	writtenSlugs,
} from "@/lib/import/postMediaRun"
import { readScriptEnv, SCRIPT_CREDENTIALS_HINT } from "@/lib/import/scriptEnv"
import { parsePostScriptArgs } from "@/lib/import/sectionArg"
import { errorMessage } from "@/lib/utils/errorMessage"
import { currentDatetimeString } from "@/lib/utils/format"
import type { Section } from "@/lib/db/sections"

// Cap the per-post diff so one big-body edit can't bury the report.
const DIFF_LINE_CAP = 8

// #region CLI

const cli = parsePostScriptArgs(process.argv.slice(2), {
	command: "yarn db:import-posts",
	knownFlags: new Set(["--overwrite", "--dry-run", "--verbose"]),
})
const isDryRun = cli.flags.has("--dry-run")
const isOverwrite = cli.flags.has("--overwrite")
const isVerbose = cli.flags.has("--verbose")

// #endregion

// #region helpers

/**
 * Reads the folder's direct `*.md` files (no recursion, so `drafts/` stays
 * out), sorted by name — the date-prefixed convention makes that chronological.
 */
async function readMarkdownFiles(folder: string): Promise<ImportFile[]> {
	const names = sortedMarkdownNames(
		await readdir(folder, { withFileTypes: true })
	)

	return Promise.all(
		names.map(async (filename) => ({
			filename,
			content: await readFile(path.join(folder, filename), "utf8"),
		}))
	)
}

/**
 * Prints one line per slug write-back and returns the count that failed. A
 * failed rewrite prints as a loud `✘` on stderr so a partial batch is obvious;
 * the caller uses the count to set a non-zero exit without aborting the import.
 */
function logSlugRewrites(outcomes: readonly SlugRewriteOutcome[]): number {
	let failures = 0

	for (const outcome of outcomes) {
		if (outcome.result === "failed") {
			failures += 1
			console.error(
				`  ✘ ${outcome.filename} — failed to write ${outcome.change}: ${outcome.error}`
			)
			continue
		}

		const verb = outcome.result === "planned" ? "would write" : "wrote"
		console.log(`  ✎ ${outcome.filename} — ${verb} ${outcome.change}`)
	}

	return failures
}

/** DB-shaped create row — the originating filename stays out of the payload. */
function toCreateRow(create: PlannedCreate) {
	return {
		title: create.title,
		slug: create.slug,
		section: create.section,
		body: create.body,
		description: create.description,
		datetime: create.datetime,
		readingTime: create.readingTime,
		published: create.published,
	}
}

/**
 * Prints one line per skip, except unchanged files (a re-run's dominant case),
 * which stay silent to keep a large no-op run scannable — they still land in
 * the caller's `skipped` total, surfaced by the closing summary count.
 */
function printSkips(skipped: SkippedFile[]): void {
	for (const skip of skipped) {
		if (skip.reason === UNCHANGED_SKIP_REASON) {
			continue
		}

		console.log(`  · ${skip.filename} — ${skip.reason}`)
	}
}

/**
 * Prints an update line, and under `--verbose` a line-level diff of the body
 * (`-` a line only in the DB, `+` only in the file) so a trivial drift is
 * distinguishable from a substantive one where the DB copy may be the newer,
 * admin-edited version.
 */
function printUpdate(
	update: PlannedUpdate,
	existingBySlug: ReadonlyMap<string, ExistingPost>,
	verbose: boolean
): void {
	console.log(
		`  ~ ${update.filename} → ${update.slug} (${Object.keys(update.data).join(", ")})`
	)

	if (!verbose || update.data.body == null) {
		return
	}

	const dbBody = existingBySlug.get(update.slug)?.body ?? ""
	const { removed, added } = diffBodyLines(dbBody, update.data.body)

	for (const line of removed.slice(0, DIFF_LINE_CAP)) {
		console.log(`      - ${line}`)
	}
	for (const line of added.slice(0, DIFF_LINE_CAP)) {
		console.log(`      + ${line}`)
	}

	const hidden =
		Math.max(0, removed.length - DIFF_LINE_CAP) +
		Math.max(0, added.length - DIFF_LINE_CAP)
	if (hidden > 0) {
		console.log(`      … ${hidden} more changed line(s)`)
	}
}

/**
 * Prints one line per planned create and update. `afterEach` adds lines under
 * a post's own: the dry run uses it to list the media that post would upload.
 */
function printPlan(
	plan: ImportPlan,
	existingBySlug: ReadonlyMap<string, ExistingPost>,
	afterEach: (slug: string) => void = () => undefined
): void {
	for (const create of plan.creates) {
		console.log(
			`  + ${create.filename} → ${create.slug} (${create.published ? "published" : "draft"})`
		)
		afterEach(create.slug)
	}

	for (const update of plan.updates) {
		printUpdate(update, existingBySlug, isVerbose)
		afterEach(update.slug)
	}
}

// #endregion

// #region media

/**
 * The section's media blobs as they were before this run, listed once on first
 * use and shared from then on: one Blob operation however many posts carry
 * media, and none for a run that never asks.
 */
function makeMediaListing(section: Section): () => Promise<ListedBlob[]> {
	let listing: Promise<ListedBlob[]> | null = null

	return () => {
		listing ??= listBlobs(blobStore, postMediaSectionPrefix(section))

		return listing
	}
}

/**
 * The listing for the sweep of old media, or `null` when there is none to
 * sweep with: no token, or the store can't be listed right now. Best-effort,
 * unlike the listing media resolution needs: the sweep is housekeeping and
 * must not fail a run whose rows are written or about to be.
 */
async function listingForSweep(
	getListing: (() => Promise<ListedBlob[]>) | null
): Promise<ListedBlob[] | null> {
	if (getListing == null) {
		return null
	}

	try {
		return await getListing()
	} catch (error) {
		console.warn(
			`  ! couldn't list stored media (${errorMessage(error)}); skipping the sweep of old media`
		)

		return null
	}
}

/**
 * Deletes, or on a dry run reports, the blobs each written post no longer
 * names: the old version of an edited file, a file the post dropped. A failed
 * sweep warns and moves on; the rows are already written, and an orphan costs
 * storage, not correctness.
 */
async function pruneWrittenMedia(
	bodyBySlug: ReadonlyMap<string, string>,
	listing: readonly ListedBlob[],
	section: Section
): Promise<void> {
	for (const [slug, body] of bodyBySlug) {
		try {
			await prunePostMedia({
				store: blobStore,
				listing,
				prefix: postMediaPrefixFor(section, slug),
				body,
				isDryRun,
				log: console.log,
			})
		} catch (error) {
			console.warn(
				`  ! couldn't prune old media for ${slug} (${errorMessage(error)}); it remains in the store`
			)
		}
	}
}

// #endregion

// #region main

async function main(): Promise<void> {
	if (cli.problem != null) {
		console.error(cli.problem)
		process.exitCode = 1

		return
	}

	const { folder, section } = cli
	const files = await readMarkdownFiles(folder)

	if (files.length === 0) {
		console.error(`No .md files in ${folder}. Nothing to import.`)
		process.exitCode = 1

		return
	}

	console.log(
		`${isDryRun ? "DRY RUN — " : ""}importing ${files.length} file(s) from ` +
			`${path.relative(process.cwd(), path.resolve(folder)) || "."} into "${section}"` +
			(isOverwrite ? " (overwrite)" : "")
	)

	const { parsed, skipped: parseSkips } = parsePostFiles(files)

	const rewriteFailures = logSlugRewrites(
		await applySlugRewrites(folder, parsed, isDryRun)
	)

	if (rewriteFailures > 0) {
		// One file's write failing (EACCES, EROFS on a mount) leaves that source
		// file un-stamped but doesn't block the rest: the resolved slug is already
		// in memory, so the DB import below is still correct, and a re-run retries
		// the backfill. Loud exit so a partial rewrite can't pass for a clean one.
		console.error(
			`\n${rewriteFailures} slug rewrite(s) failed — source file(s) left unchanged; ` +
				"the DB import still runs. Re-run to retry the backfill."
		)
		process.exitCode = 1
	}

	const prisma = makeScriptPrisma()

	try {
		const existingRows = await prisma.post.findMany({
			where: { section, slug: { in: parsed.map((file) => file.slug) } },
			select: {
				id: true,
				slug: true,
				title: true,
				body: true,
				description: true,
				datetime: true,
				readingTime: true,
			},
		})
		const existingBySlug = new Map<string, ExistingPost>(
			existingRows.map(({ slug, ...row }) => [slug, row])
		)

		// Without a token the run still imports plain posts; it fails, below, only
		// if a post it could write references local media.
		const getListing =
			readScriptEnv("BLOB_READ_WRITE_TOKEN") == null
				? null
				: makeMediaListing(section)
		// On a real run this uploads the media of the posts it plans to write,
		// logging each upload, before the plan's own lines print below. A failed
		// listing or upload stops the run before anything is written.
		const result = await planPostImportWithMedia({
			parsed,
			existingBySlug,
			planOptions: {
				section,
				now: currentDatetimeString(),
				overwrite: isOverwrite,
			},
			// A missing file skips its one post. Any other read failure, and a
			// path that leaves the folder, stops the run as it is.
			read: (relativePath) => readFileInFolder(folder, relativePath),
			store: blobStore,
			listStored: getListing,
			isDryRun,
			log: console.log,
		})

		if (!result.ok) {
			console.error(`${result.reason}. ${SCRIPT_CREDENTIALS_HINT}`)
			process.exitCode = 1

			return
		}

		const { plan, mediaBySlug, stored } = result
		const skipped = [...parseSkips, ...result.skipped, ...plan.skipped]

		printPlan(plan, existingBySlug, (slug) => {
			const media = mediaBySlug.get(slug)

			// On a real run the uploads are done and nothing is pending.
			if (isDryRun && media != null) {
				logPendingUploads(media, stored, console.log)
			}
		})
		printSkips(skipped)

		if (isDryRun) {
			const listing = await listingForSweep(getListing)

			if (listing != null) {
				await pruneWrittenMedia(
					writtenBodies(plan, existingBySlug, new Set(writtenSlugs(plan))),
					listing,
					section
				)
			}

			console.log(
				`\nDry run complete: ${plan.creates.length} to create, ` +
					`${plan.updates.length} to update, ${skipped.length} skipped — nothing written.`
			)

			return
		}

		if (plan.creates.length === 0 && plan.updates.length === 0) {
			console.log(
				`\nImport complete: nothing to write, ${skipped.length} skipped.`
			)

			return
		}

		// Serializable matches the admin routes, so a concurrent admin edit
		// can't slip a non-repeatable read between the plan's pre-query and
		// these writes on the same rows.
		const created = await prisma.$transaction(
			async (tx) => {
				// `skipDuplicates` is the same belt-and-suspenders as the bulk
				// endpoint: a concurrent create between the pre-query and this
				// insert becomes a reconciled skip instead of aborting the batch.
				const created =
					plan.creates.length > 0
						? await tx.post.createManyAndReturn({
								data: plan.creates.map(toCreateRow),
								skipDuplicates: true,
								select: { slug: true },
							})
						: []

				for (const update of plan.updates) {
					await tx.post.update({ where: { id: update.id }, data: update.data })
				}

				return created
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
		)

		// Surface any row `skipDuplicates` ate rather than letting the created
		// count silently disagree with the plan.
		if (created.length < plan.creates.length) {
			const createdSlugs = new Set(created.map((row) => row.slug))
			const eaten = plan.creates
				.filter((create) => !createdSlugs.has(create.slug))
				.map((create) => ({
					filename: create.filename,
					reason: "Skipped at insert (concurrent write)",
				}))

			printSkips(eaten)
			skipped.push(...eaten)
		}

		// Only after the write, and only for rows it wrote: a create the insert
		// skipped belongs to whoever wrote that row first.
		const listing = await listingForSweep(getListing)

		if (listing != null) {
			const written = new Set([
				...created.map((row) => row.slug),
				...plan.updates.map((update) => update.slug),
			])

			await pruneWrittenMedia(
				writtenBodies(plan, existingBySlug, written),
				listing,
				section
			)
		}

		console.log(
			`\nImport complete: ${created.length} created, ${plan.updates.length} updated, ` +
				`${skipped.length} skipped.`
		)
		// Script writes bypass the app, so `unstable_cache` tags aren't busted.
		// Print the changed posts as `section/slug` so they paste straight into
		// the admin dashboard's Revalidate panel ("Revalidate listed" for posts).
		const changed = [
			...created.map((row) => `${section}/${row.slug}`),
			...plan.updates.map((update) => `${section}/${update.slug}`),
		]

		if (changed.length > 0) {
			console.log(
				"\nChanged posts (paste into the admin dashboard's Revalidate panel):"
			)
			console.log(changed.join(", "))
		}
	} finally {
		await prisma.$disconnect()
	}
}

main().catch((error) => {
	// Log the full error (not just its message) so an unexpected failure — a
	// Prisma error, a transaction abort — surfaces its stack in CI logs.
	console.error(error)
	process.exit(1)
})

// #endregion
