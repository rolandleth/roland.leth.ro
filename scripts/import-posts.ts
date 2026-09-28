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
import { flagsProblem, parseCliArgs } from "@/lib/import/cliArgs"
import { sortedMarkdownNames } from "@/lib/import/markdownFiles"
import {
	diffBodyLines,
	type ExistingPost,
	type ImportFile,
	parsePostFiles,
	type PlannedCreate,
	type PlannedUpdate,
	planPostImport,
	type SkippedFile,
	UNCHANGED_SKIP_REASON,
} from "@/lib/import/postImport"
import { resolveSectionArg } from "@/lib/import/sectionArg"
import { currentDatetimeString } from "@/lib/utils/format"

const KNOWN_FLAGS = new Set(["--dry-run", "--overwrite", "--verbose"])
const SECTION_FLAG = "--section"
const VALUE_FLAGS = new Set([SECTION_FLAG])
// Cap the per-post diff so one big-body edit can't bury the report.
const DIFF_LINE_CAP = 8

// #region CLI

const parsedArgs = parseCliArgs(process.argv.slice(2), KNOWN_FLAGS, VALUE_FLAGS)
const { flags, values, positionals } = parsedArgs
const isDryRun = flags.has("--dry-run")
const isOverwrite = flags.has("--overwrite")
const isVerbose = flags.has("--verbose")
const sectionFlag = values.get(SECTION_FLAG)

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

// #endregion

// #region main

/**
 * The reason the arguments can't start a run, or `null` when they can. Checked
 * before anything touches the folder or the DB.
 */
function cliArgsProblem(): string | null {
	const flagProblem = flagsProblem(parsedArgs, KNOWN_FLAGS, VALUE_FLAGS)

	if (flagProblem != null) {
		return flagProblem
	}

	if (positionals.length !== 1) {
		return "Usage: yarn db:import-posts <folder> [--section=<section>] [--overwrite] [--dry-run] [--verbose]"
	}

	return null
}

async function main(): Promise<void> {
	const argsProblem = cliArgsProblem()

	if (argsProblem != null) {
		console.error(argsProblem)
		process.exitCode = 1

		return
	}

	const folder = positionals[0]
	const sectionArg = resolveSectionArg(folder, sectionFlag)

	if ("problem" in sectionArg) {
		console.error(sectionArg.problem)
		process.exitCode = 1

		return
	}

	const { section } = sectionArg
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

		const now = currentDatetimeString()
		const plan = planPostImport(parsed, existingBySlug, {
			section,
			now,
			overwrite: isOverwrite,
		})
		const skipped = [...parseSkips, ...plan.skipped]

		for (const create of plan.creates) {
			console.log(
				`  + ${create.filename} → ${create.slug} (${create.published ? "published" : "draft"})`
			)
		}
		for (const update of plan.updates) {
			printUpdate(update, existingBySlug, isVerbose)
		}
		printSkips(skipped)

		if (isDryRun) {
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
