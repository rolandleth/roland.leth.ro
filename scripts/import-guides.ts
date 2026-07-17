// Guide importer: loads a `guides/` folder into the guides + topics tables.
//
//   yarn db:import-guides ../reckon/marketing/content/guides --dry-run
//   yarn db:import-guides ../reckon/marketing/content/guides
//   yarn db:import-guides ../reckon/marketing/content/guides --overwrite
//
// Layout — the directory is the grouping:
//
//   guides/
//     2026-07-17-How calibrated are you.md    ungrouped guide
//     making-better-decisions/
//       2026-07-17-How to keep a decision journal.md
//       index.md                              the topic hub
//     drafts/                                 never imported
//
// One level of nesting only. Filenames are for disk sorting; slug and title come
// from frontmatter. Topics are written before guides in the same run so a
// brand-new topic and its guides import together.
//
// Create-only by default; `--overwrite` updates existing rows in place (never
// touching `published` — importing is the decision to publish, `drafts/` is how
// you don't). Unchanged files plan zero writes, so re-runs are idempotent.
//
// Direct Prisma writes: this deliberately skips the admin API, so it cannot bust
// the site's caches. After a run with writes, paste the printed slugs into the
// admin dashboard's Revalidate panel (the guides row).
//
// Targets prod by running with prod credentials in the environment
// (DATABASE_URL, e.g. via `vercel env pull`). Always `--dry-run` first.

import "dotenv/config"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { PrismaPg } from "@prisma/adapter-pg"
import { Prisma, PrismaClient } from "@/generated/prisma/client"
import {
	DRAFTS_FOLDER,
	type ExistingGuide,
	type ExistingTopic,
	type GuideSourceFile,
	parseGuideFiles,
	planGuideImport,
	type SkippedFile,
	TOPIC_FILENAME,
	UNCHANGED_SKIP_REASON,
} from "@/lib/import/guideImport"

const KNOWN_FLAGS = new Set(["--dry-run", "--overwrite"])

// #region CLI

const argv = process.argv.slice(2)
const isDryRun = argv.includes("--dry-run")
const isOverwrite = argv.includes("--overwrite")
const positionals = argv.filter((arg) => !arg.startsWith("--"))
const unknownFlags = argv.filter(
	(arg) => arg.startsWith("--") && !KNOWN_FLAGS.has(arg)
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
 * Walks the guides root one level deep: root `*.md` files are ungrouped guides,
 * each subfolder is a topic (`index.md`) plus its guides. `drafts/` is skipped
 * outright, and nothing recurses past one level — a deeper tree is a layout
 * mistake, and silently flattening it would import guides under the wrong topic.
 */
async function readGuideFiles(root: string): Promise<GuideSourceFile[]> {
	const entries = await readdir(root, { withFileTypes: true })
	const files: GuideSourceFile[] = []

	const rootNames = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => entry.name)
		.sort()

	for (const name of rootNames) {
		files.push({
			relativePath: name,
			content: await readFile(path.join(root, name), "utf8"),
			topicFolder: null,
			isTopicFile: false,
		})
	}

	const folders = entries
		.filter((entry) => entry.isDirectory() && entry.name !== DRAFTS_FOLDER)
		.map((entry) => entry.name)
		.sort()

	for (const folder of folders) {
		const folderEntries = await readdir(path.join(root, folder), {
			withFileTypes: true,
		})
		const names = folderEntries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
			.map((entry) => entry.name)
			.sort()

		for (const name of names) {
			files.push({
				relativePath: path.join(folder, name),
				content: await readFile(path.join(root, folder, name), "utf8"),
				topicFolder: folder,
				isTopicFile: name === TOPIC_FILENAME,
			})
		}
	}

	return files
}

/** Prints one line per skip, except unchanged files (a re-run's dominant case). */
function printSkips(skipped: readonly SkippedFile[]): void {
	for (const skip of skipped) {
		if (skip.reason === UNCHANGED_SKIP_REASON) {
			continue
		}

		console.log(`  · ${skip.relativePath} — ${skip.reason}`)
	}
}

// #endregion

// #region main

async function main(): Promise<void> {
	if (unknownFlags.length > 0) {
		console.error(
			`Unknown flag(s): ${unknownFlags.join(", ")}. Supported: ${[...KNOWN_FLAGS].join(", ")}.`
		)
		process.exitCode = 1

		return
	}

	if (positionals.length !== 1) {
		console.error(
			"Usage: yarn db:import-guides <guides-folder> [--overwrite] [--dry-run]"
		)
		process.exitCode = 1

		return
	}

	const root = positionals[0]
	const files = await readGuideFiles(root)

	if (files.length === 0) {
		console.error(`No .md files in ${root}. Nothing to import.`)
		process.exitCode = 1

		return
	}

	console.log(
		`${isDryRun ? "DRY RUN — " : ""}importing ${files.length} file(s) from ` +
			`${path.relative(process.cwd(), path.resolve(root)) || "."}` +
			(isOverwrite ? " (overwrite)" : "")
	)

	const parsed = parseGuideFiles(files)
	const prisma = makePrisma()

	try {
		const topicSlugs = parsed.topics.map((topic) => topic.slug)
		const guideSlugs = parsed.guides.map((guide) => guide.slug)

		const [existingTopics, existingGuides] = await Promise.all([
			prisma.guideTopic.findMany({
				where: { slug: { in: topicSlugs } },
				select: {
					id: true,
					slug: true,
					title: true,
					shortDescription: true,
					description: true,
					projectSlug: true,
				},
			}),
			prisma.guide.findMany({
				where: { slug: { in: guideSlugs } },
				select: {
					id: true,
					slug: true,
					title: true,
					description: true,
					body: true,
					projectSlug: true,
					topicId: true,
					sortOrder: true,
					readingTime: true,
				},
			}),
		])

		const topicsBySlug = new Map<string, ExistingTopic>(
			existingTopics.map(({ slug, ...row }) => [slug, row])
		)
		const guidesBySlug = new Map<string, ExistingGuide>(
			existingGuides.map(({ slug, ...row }) => [slug, row])
		)

		// Cross-table slug collisions the batch itself can't see: a guide file
		// whose slug is already a topic in the DB (or vice versa). Postgres can't
		// enforce this across two tables, so it's checked here before any write.
		const crossTableSkips: SkippedFile[] = []
		const [dbTopicSlugs, dbGuideSlugs] = await Promise.all([
			prisma.guideTopic.findMany({
				where: { slug: { in: guideSlugs } },
				select: { slug: true },
			}),
			prisma.guide.findMany({
				where: { slug: { in: topicSlugs } },
				select: { slug: true },
			}),
		])
		const takenByTopic = new Set(dbTopicSlugs.map((row) => row.slug))
		const takenByGuide = new Set(dbGuideSlugs.map((row) => row.slug))

		const importableGuides = parsed.guides.filter((guide) => {
			if (!takenByTopic.has(guide.slug)) {
				return true
			}

			crossTableSkips.push({
				relativePath: guide.relativePath,
				reason: `Slug "${guide.slug}" already belongs to a topic`,
			})

			return false
		})
		const importableTopics = parsed.topics.filter((topic) => {
			if (!takenByGuide.has(topic.slug)) {
				return true
			}

			crossTableSkips.push({
				relativePath: topic.relativePath,
				reason: `Slug "${topic.slug}" already belongs to a guide`,
			})

			return false
		})

		const plan = planGuideImport(
			{ topics: importableTopics, guides: importableGuides },
			{ topicsBySlug, guidesBySlug },
			{ overwrite: isOverwrite }
		)
		const skipped = [...parsed.skipped, ...crossTableSkips, ...plan.skipped]

		for (const create of plan.topicCreates) {
			console.log(`  + ${create.relativePath} → topic ${create.slug}`)
		}
		for (const update of plan.topicUpdates) {
			console.log(
				`  ~ ${update.relativePath} → topic ${update.slug} (${Object.keys(update.data).join(", ")})`
			)
		}
		for (const create of plan.guideCreates) {
			console.log(`  + ${create.relativePath} → ${create.slug}`)
		}
		for (const update of plan.guideUpdates) {
			console.log(
				`  ~ ${update.relativePath} → ${update.slug} (${Object.keys(update.data).join(", ")})`
			)
		}
		printSkips(skipped)

		const writeCount =
			plan.topicCreates.length +
			plan.topicUpdates.length +
			plan.guideCreates.length +
			plan.guideUpdates.length

		if (isDryRun) {
			console.log(
				`\nDry run complete: ${plan.topicCreates.length + plan.guideCreates.length} to create, ` +
					`${plan.topicUpdates.length + plan.guideUpdates.length} to update, ` +
					`${skipped.length} skipped — nothing written.`
			)

			return
		}

		if (writeCount === 0) {
			console.log(
				`\nImport complete: nothing to write, ${skipped.length} skipped.`
			)

			return
		}

		// Serializable matches the admin routes, so a concurrent admin edit can't
		// slip a non-repeatable read between the plan's pre-query and these writes.
		await prisma.$transaction(
			async (tx) => {
				for (const create of plan.topicCreates) {
					await tx.guideTopic.create({
						data: {
							slug: create.slug,
							title: create.title,
							shortDescription: create.shortDescription,
							description: create.description,
							projectSlug: create.projectSlug,
						},
					})
				}

				for (const update of plan.topicUpdates) {
					await tx.guideTopic.update({
						where: { id: update.id },
						data: update.data,
					})
				}

				// Resolved after the topic writes so a guide can join a topic created
				// in this same run.
				const folderToId = new Map<string, number>()

				for (const topic of parsed.topics) {
					const row = await tx.guideTopic.findUnique({
						where: { slug: topic.slug },
						select: { id: true },
					})

					if (row != null) {
						folderToId.set(topic.folder, row.id)
					}
				}

				const topicIdFor = (folder: string | null): number | null =>
					folder == null ? null : (folderToId.get(folder) ?? null)

				for (const create of plan.guideCreates) {
					await tx.guide.create({
						data: {
							slug: create.slug,
							title: create.title,
							description: create.description,
							body: create.body,
							projectSlug: create.projectSlug,
							topicId: topicIdFor(create.topicFolder),
							sortOrder: create.sortOrder,
							readingTime: create.readingTime,
							published: true,
							publishedAt: new Date(),
						},
					})
				}

				for (const update of plan.guideUpdates) {
					await tx.guide.update({
						where: { id: update.id },
						// Topic membership comes from the folder on every run, so a moved
						// file re-groups its guide without changing its URL.
						data: { ...update.data, topicId: topicIdFor(update.topicFolder) },
					})
				}
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
		)

		console.log(
			`\nImport complete: ${plan.topicCreates.length + plan.guideCreates.length} created, ` +
				`${plan.topicUpdates.length + plan.guideUpdates.length} updated, ${skipped.length} skipped.`
		)

		// Script writes bypass the app, so `unstable_cache` tags aren't busted.
		const changed = [
			...plan.topicCreates.map((row) => row.slug),
			...plan.topicUpdates.map((row) => row.slug),
			...plan.guideCreates.map((row) => row.slug),
			...plan.guideUpdates.map((row) => row.slug),
		]

		console.log(
			"\nChanged guides (paste into the admin dashboard's Revalidate panel):"
		)
		console.log(changed.join(", "))
	} finally {
		await prisma.$disconnect()
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error))
	process.exit(1)
})

// #endregion
