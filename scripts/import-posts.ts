// Post importer: bulk-loads markdown files (`yyyy-MM-dd[-HHmm]-Title.md`) from
// a folder into the posts table, optionally overwriting existing rows.
//
//   yarn db:import-posts ../blog/posts/tech                 # create-only; section from folder name
//   yarn db:import-posts ../blog/posts/tech --overwrite     # also update existing slugs in place
//   yarn db:import-posts ../blog/posts/life --dry-run       # report the plan, write nothing
//   yarn db:import-posts /some/folder --section=tech        # explicit section override
//
// Reads only the folder's direct `*.md` files — a `drafts/` subfolder never
// imports. The filename carries datetime + title (same convention as the admin
// bulk picker); a first line equal to the title is stripped from the body (the
// content repo keeps the title as the file's first line).
//
// Creates follow the bulk endpoint's rule: future-dated files import as
// published (scheduled), past-dated as drafts. Overwrites refresh title, body,
// datetime, and reading time, PRESERVE `published`, and only re-derive
// `summary` when the stored one was itself derived — a hand-authored summary
// survives. Unchanged files plan zero writes, so re-runs are idempotent.
//
// Direct Prisma writes: this deliberately skips the admin API, so it cannot
// bust the site's caches. After a run with writes, hit "Revalidate caches" in
// the admin nav so the changes surface.
//
// Targets prod by running with prod credentials in the environment
// (DATABASE_URL, e.g. via `vercel env pull`). Always `--dry-run` first.

import "dotenv/config"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { PrismaPg } from "@prisma/adapter-pg"
import { Prisma, PrismaClient } from "@/generated/prisma/client"
import { isValidSection, type Section } from "@/lib/db/sections"
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
import { currentDatetimeString } from "@/lib/utils/format"

const KNOWN_FLAGS = new Set(["--dry-run", "--overwrite", "--verbose"])
const SECTION_FLAG_PREFIX = "--section="
// Cap the per-post diff so one big-body edit can't bury the report.
const DIFF_LINE_CAP = 8

// #region CLI

const argv = process.argv.slice(2)
const isDryRun = argv.includes("--dry-run")
const isOverwrite = argv.includes("--overwrite")
const isVerbose = argv.includes("--verbose")
const sectionFlag = argv
	.find((arg) => arg.startsWith(SECTION_FLAG_PREFIX))
	?.slice(SECTION_FLAG_PREFIX.length)
const positionals = argv.filter((arg) => !arg.startsWith("--"))
const unknownFlags = argv.filter(
	(arg) =>
		arg.startsWith("--") &&
		!KNOWN_FLAGS.has(arg) &&
		!arg.startsWith(SECTION_FLAG_PREFIX)
)

// #endregion

// #region helpers

function makePrisma(): PrismaClient {
	const connectionString = process.env.DATABASE_URL

	if (connectionString == null || connectionString === "") {
		throw new Error(
			"DATABASE_URL is not set. Provide DB credentials before importing (e.g. `vercel env pull`)."
		)
	}

	return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

/**
 * Resolves the target section: the explicit `--section=` value when present,
 * otherwise the folder's basename (`…/posts/tech` → `tech`). Fails loudly on
 * anything else — importing into the wrong section is a cross-section mess to
 * untangle, not a typo to shrug at.
 */
function resolveSection(folder: string, flag: string | undefined): Section {
	const candidate = flag ?? path.basename(path.resolve(folder))

	if (!isValidSection(candidate)) {
		throw new Error(
			`"${candidate}" is not a valid section. Use --section=<value> or point at a folder named after one.`
		)
	}

	return candidate
}

/**
 * Reads the folder's direct `*.md` files (no recursion, so `drafts/` stays
 * out), sorted by name — the date-prefixed convention makes that chronological.
 */
async function readMarkdownFiles(folder: string): Promise<ImportFile[]> {
	const entries = await readdir(folder, { withFileTypes: true })
	const names = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => entry.name)
		.sort()

	return Promise.all(
		names.map(async (filename) => ({
			filename,
			content: await readFile(path.join(folder, filename), "utf8"),
		}))
	)
}

/** DB-shaped create row — the originating filename stays out of the payload. */
function toCreateRow(create: PlannedCreate) {
	return {
		title: create.title,
		slug: create.slug,
		section: create.section,
		body: create.body,
		summary: create.summary,
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

async function main(): Promise<void> {
	if (unknownFlags.length > 0) {
		console.error(
			`Unknown flag(s): ${unknownFlags.join(", ")}. Supported: ${[...KNOWN_FLAGS].join(", ")}, ${SECTION_FLAG_PREFIX}<section>.`
		)
		process.exitCode = 1

		return
	}

	if (positionals.length !== 1) {
		console.error(
			"Usage: yarn db:import-posts <folder> [--section=<section>] [--overwrite] [--dry-run] [--verbose]"
		)
		process.exitCode = 1

		return
	}

	const folder = positionals[0]
	const section = resolveSection(folder, sectionFlag)
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

	const prisma = makePrisma()

	try {
		const existingRows = await prisma.post.findMany({
			where: { section, slug: { in: parsed.map((file) => file.slug) } },
			select: {
				id: true,
				slug: true,
				title: true,
				body: true,
				summary: true,
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
	console.error(error instanceof Error ? error.message : String(error))
	process.exit(1)
})

// #endregion
