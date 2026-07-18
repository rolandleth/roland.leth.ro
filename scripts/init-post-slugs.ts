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
// Matching (in `slugInit.ts`): filename datetime → DB row (the import contract's
// stable key — overwrites refresh the DB datetime from the filename), falling
// back to an exact frontmatter-title match ONLY for a row at the file's own
// datetime. A file matching zero or several rows, or whose only title match sits
// at a different datetime, is reported and left untouched — never guessed, so a
// new file that reuses an old title can't be stamped with an unrelated slug.
// Every matched file gets an explicit `slug:` line, including ones whose slug the
// title would derive correctly, so the repo converges fully and later imports
// plan no rewrites. Writes are atomic; one file's failure is reported and the
// run continues.
//
// Needs DATABASE_URL (e.g. `vercel env pull`). Always `--dry-run` first.

import "dotenv/config"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client"
import { isValidSection, type Section } from "@/lib/db/sections"
import { writeFileAtomic } from "@/lib/import/atomicWrite"
import { sortedMarkdownNames } from "@/lib/import/markdownFiles"
import { groupBy, planStamp, type Row } from "@/lib/import/slugInit"
import { errorMessage } from "@/lib/utils/errorMessage"

const KNOWN_FLAGS = new Set(["--dry-run"])
const SECTION_FLAG_PREFIX = "--section="

const argv = process.argv.slice(2)
const isDryRun = argv.includes("--dry-run")
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

type StampOutcome =
	// `slug` is set only when the match succeeded but the WRITE failed — the row
	// has a file, so it must still count as matched even though its stamp didn't
	// land, or it would also show up in the "no matching file" list.
	| { kind: "problem"; message: string; slug?: string }
	| { kind: "unchanged"; slug: string }
	| { kind: "written"; filename: string; slug: string; titleDiffers: boolean }

/**
 * Reads one file, plans its stamp, and (unless dry-run) writes it. Every failure
 * mode — an unreadable file, a bad match, a write error — comes back as a
 * `problem` carrying the filename, so a mid-run I/O error names its file instead
 * of surfacing as a bare top-level stack trace.
 */
async function stampFile(
	folder: string,
	filename: string,
	byDatetime: ReadonlyMap<string, Row[]>,
	byTitle: ReadonlyMap<string, Row[]>
): Promise<StampOutcome> {
	const filePath = path.join(folder, filename)

	let content: string

	try {
		content = await readFile(filePath, "utf8")
	} catch (error) {
		return { kind: "problem", message: `${filename} — ${errorMessage(error)}` }
	}

	const plan = planStamp(filename, content, byDatetime, byTitle)

	if (plan.kind === "problem" || plan.kind === "unchanged") {
		return plan
	}

	const note = plan.titleDiffers ? " (title differs from DB)" : ""

	if (isDryRun) {
		console.log(`  ✎ ${filename} — would write ${plan.change}${note}`)
	} else {
		try {
			await writeFileAtomic(filePath, plan.content)
		} catch (error) {
			return {
				kind: "problem",
				message: `${filename} — failed to write: ${errorMessage(error)}`,
				slug: plan.slug,
			}
		}

		console.log(`  ✎ ${filename} — wrote ${plan.change}${note}`)
	}

	return {
		kind: "written",
		filename,
		slug: plan.slug,
		titleDiffers: plan.titleDiffers,
	}
}

type InitResult = {
	written: number
	unchanged: number
	problems: string[]
	/** Files stamped where the DB title disagrees — safe, but surfaced to eyeball. */
	titleMismatches: string[]
}

async function initFolder(
	prisma: PrismaClient,
	folder: string,
	section: Section
): Promise<InitResult> {
	const names = sortedMarkdownNames(
		await readdir(folder, { withFileTypes: true })
	)

	const rows: Row[] = await prisma.post.findMany({
		where: { section },
		select: { slug: true, title: true, datetime: true },
	})
	const byDatetime = groupBy(rows, "datetime")
	const byTitle = groupBy(rows, "title")

	let written = 0
	let unchanged = 0
	const problems: string[] = []
	const titleMismatches: string[] = []
	const matchedSlugs = new Set<string>()

	for (const filename of names) {
		const result = await stampFile(folder, filename, byDatetime, byTitle)

		if (result.kind === "problem") {
			problems.push(result.message)

			// A write-failure carries its resolved slug: the row DOES have a file
			// (the write just failed), so record it so it isn't also flagged as
			// having no matching file.
			if (result.slug != null) {
				matchedSlugs.add(result.slug)
			}

			continue
		}

		matchedSlugs.add(result.slug)

		if (result.kind === "unchanged") {
			unchanged += 1
			continue
		}

		written += 1

		if (result.titleDiffers) {
			titleMismatches.push(`${result.filename} → ${result.slug}`)
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

	return { written, unchanged, problems, titleMismatches }
}

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
		const { written, unchanged, problems, titleMismatches } = await initFolder(
			prisma,
			folder,
			section
		)

		// Safe (the slug came from the datetime-matched row) but the likeliest
		// place a wrong stamp would hide, so surface it on its own for a human to
		// eyeball rather than burying it in the per-file log.
		if (titleMismatches.length > 0) {
			console.log(
				`\nStamped, but DB title differs — eyeball these (${titleMismatches.length}):`
			)
			for (const mismatch of titleMismatches) {
				console.log(`  ? ${mismatch}`)
			}
		}

		const hasProblems = problems.length > 0

		if (hasProblems) {
			console.log(`\nNeeds manual attention (${problems.length}):`)
			for (const problem of problems) {
				console.log(`  ! ${problem}`)
			}
			// Loud exit so a partial init can't pass for a complete one.
			process.exitCode = 1
		}

		// `problems` mixes unmatched files, read failures, and write failures — so
		// label it "needing attention", not "unmatched". When any exist, the tail
		// says FAILED (partial) so an operator scanning only the last line can't
		// mistake a partial run for a clean one.
		const status = isDryRun
			? "Dry run complete"
			: hasProblems
				? "Init FAILED (partial)"
				: "Init complete"

		console.log(
			`\n${status}: ${written} ${isDryRun ? "to write" : "written"}, ` +
				`${unchanged} already correct, ${problems.length} needing attention.`
		)
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
