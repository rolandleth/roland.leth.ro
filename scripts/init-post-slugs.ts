// DB→files slug resync: stamps each content-repo post file with its REAL slug
// from the DB. Written as the one-shot init for the `slug:`-is-authoritative
// import rule (so files start from truth instead of re-derived titles, which
// would silently move legacy/retitled posts' URLs); kept because it doubles as
// a resync tool after a DB restore or a DB-side slug correction. Idempotent —
// correct files count as "already correct", ambiguity is reported, not guessed.
//
//   yarn tsx scripts/init-post-slugs.ts ../blog/tech --dry-run   # report only
//   yarn tsx scripts/init-post-slugs.ts ../blog/tech             # write files
//   yarn tsx scripts/init-post-slugs.ts /some/folder --section=tech
//
// Matching: filename datetime → DB row (the import contract's stable key —
// overwrites refresh the DB datetime from the filename), falling back to an
// exact frontmatter-title match. A file matching zero or several rows either
// way is reported and left untouched — never guessed. Every matched file gets
// an explicit `slug:` line, including ones whose slug the title would derive
// correctly, so the repo converges fully and later imports plan no rewrites.
//
// Needs DATABASE_URL (e.g. `vercel env pull`). Always `--dry-run` first.

import "dotenv/config"
import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client"
import { parseBulkImportFilename } from "@/lib/api/bulkImportParser"
import { isValidSection, type Section } from "@/lib/db/sections"
import { parseFrontmatter, setFrontmatterSlug } from "@/lib/import/frontmatter"

type Row = { slug: string; title: string; datetime: string }

const argv = process.argv.slice(2)
const isDryRun = argv.includes("--dry-run")
const sectionFlag = argv
	.find((arg) => arg.startsWith("--section="))
	?.slice("--section=".length)
const positionals = argv.filter((arg) => !arg.startsWith("--"))

// simplified: `makePrisma`/`resolveSection` are copied from `import-posts.ts`
// rather than extracted — not worth a shared module for a rarely-run resync
// tool; if a third script ever needs them, extract then.
function makePrisma(): PrismaClient {
	const connectionString = process.env.DATABASE_URL

	if (connectionString == null || connectionString === "") {
		throw new Error(
			"DATABASE_URL is not set. Provide DB credentials first (e.g. `vercel env pull`)."
		)
	}

	return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

function resolveSection(folder: string, flag: string | undefined): Section {
	const candidate = flag ?? path.basename(path.resolve(folder))

	if (!isValidSection(candidate)) {
		throw new Error(
			`"${candidate}" is not a valid section. Use --section=<value> or point at a folder named after one.`
		)
	}

	return candidate
}

function groupBy(rows: Row[], key: "datetime" | "title"): Map<string, Row[]> {
	const map = new Map<string, Row[]>()

	for (const row of rows) {
		const group = map.get(row[key])

		if (group == null) {
			map.set(row[key], [row])
		} else {
			group.push(row)
		}
	}

	return map
}

/**
 * The file's DB row when exactly one matches: by datetime first, by exact
 * title as the fallback (covers a re-dated file or a same-minute collision).
 * `null` when both keys are ambiguous or empty — the caller reports, not
 * guesses.
 */
function matchRow(
	byDatetime: Row[] | undefined,
	byTitle: Row[] | undefined
): Row | null {
	if (byDatetime?.length === 1) {
		return byDatetime[0]
	}

	if (byTitle?.length === 1) {
		return byTitle[0]
	}

	return null
}

type StampResult =
	| { kind: "written"; slug: string }
	| { kind: "unchanged"; slug: string }
	| { kind: "problem"; message: string }

/**
 * Resolves one file against the DB and writes (or dry-run reports) its
 * `slug:` line. Never guesses: an unparseable file or an ambiguous/missing
 * DB match comes back as a `problem` for the caller to surface.
 */
async function stampFile(
	folder: string,
	filename: string,
	byDatetime: Map<string, Row[]>,
	byTitle: Map<string, Row[]>
): Promise<StampResult> {
	const filenameResult = parseBulkImportFilename(filename)

	if (!filenameResult.ok) {
		return {
			kind: "problem",
			message: `${filename} — ${filenameResult.reason}`,
		}
	}

	const content = await readFile(path.join(folder, filename), "utf8")
	const { title, slug: fileSlug } = parseFrontmatter(content)

	if (title == null) {
		return {
			kind: "problem",
			message: `${filename} — missing \`title:\` frontmatter`,
		}
	}

	const row = matchRow(
		byDatetime.get(filenameResult.datetime),
		byTitle.get(title)
	)

	if (row == null) {
		return {
			kind: "problem",
			message: `${filename} — no unambiguous DB match (datetime ${filenameResult.datetime}, title "${title}")`,
		}
	}

	if (fileSlug === row.slug) {
		return { kind: "unchanged", slug: row.slug }
	}

	// A title drift means the DB copy was admin-edited after import — the
	// slug is still right (it came from the row), but worth eyeballing.
	const note = row.title === title ? "" : " (title differs from DB)"
	const change =
		fileSlug == null ? `slug: ${row.slug}` : `slug: "${fileSlug}" → ${row.slug}`

	if (isDryRun) {
		console.log(`  ✎ ${filename} — would write ${change}${note}`)
	} else {
		await writeFile(
			path.join(folder, filename),
			setFrontmatterSlug(content, row.slug)
		)
		console.log(`  ✎ ${filename} — wrote ${change}${note}`)
	}

	return { kind: "written", slug: row.slug }
}

async function initFolder(
	prisma: PrismaClient,
	folder: string,
	section: Section
): Promise<{ written: number; unchanged: number; problems: string[] }> {
	const entries = await readdir(folder, { withFileTypes: true })
	const names = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => entry.name)
		.sort()

	const rows: Row[] = await prisma.post.findMany({
		where: { section },
		select: { slug: true, title: true, datetime: true },
	})
	const byDatetime = groupBy(rows, "datetime")
	const byTitle = groupBy(rows, "title")

	let written = 0
	let unchanged = 0
	const problems: string[] = []
	const matchedSlugs = new Set<string>()

	for (const filename of names) {
		const result = await stampFile(folder, filename, byDatetime, byTitle)

		if (result.kind === "problem") {
			problems.push(result.message)
			continue
		}

		matchedSlugs.add(result.slug)

		if (result.kind === "written") {
			written += 1
		} else {
			unchanged += 1
		}
	}

	// Rows with no file are fine (admin-only posts), but list them so a
	// mass-mismatch (wrong folder, wrong section) is obvious.
	const fileless = rows.filter((row) => !matchedSlugs.has(row.slug))

	if (fileless.length > 0) {
		console.log(
			`\nDB rows with no matching file (${fileless.length}): ` +
				fileless.map((row) => row.slug).join(", ")
		)
	}

	return { written, unchanged, problems }
}

async function main(): Promise<void> {
	if (positionals.length !== 1) {
		console.error(
			"Usage: yarn tsx scripts/init-post-slugs.ts <folder> [--section=<section>] [--dry-run]"
		)
		process.exitCode = 1

		return
	}

	const folder = positionals[0]
	const section = resolveSection(folder, sectionFlag)

	console.log(
		`${isDryRun ? "DRY RUN — " : ""}stamping files in ` +
			`${path.relative(process.cwd(), path.resolve(folder)) || "."} with DB slugs for "${section}"`
	)

	const prisma = makePrisma()

	try {
		const { written, unchanged, problems } = await initFolder(
			prisma,
			folder,
			section
		)

		if (problems.length > 0) {
			console.log(`\nNeeds manual attention (${problems.length}):`)
			for (const problem of problems) {
				console.log(`  ! ${problem}`)
			}
			// Loud exit so a partial init can't pass for a complete one.
			process.exitCode = 1
		}

		console.log(
			`\n${isDryRun ? "Dry run" : "Init"} complete: ${written} ${isDryRun ? "to write" : "written"}, ` +
				`${unchanged} already correct, ${problems.length} unmatched.`
		)
	} finally {
		await prisma.$disconnect()
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error))
	process.exit(1)
})
