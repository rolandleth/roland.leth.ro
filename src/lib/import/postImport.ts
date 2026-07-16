// Pure, I/O-free core of post ingestion. Mirrors the `projectImport.ts`
// split: everything here is deterministic and unit-tested; the import script
// (`scripts/import-posts.ts`) is the thin imperative shell that reads files
// and writes to the DB. The admin bulk endpoint shares `parsePostFiles`, so
// the two ingestion paths can't drift on which files import and under what
// slug (it ignores `slugRewrite` — an upload can't be written back).
//
// Title source of truth is the file's `title:` frontmatter, NOT the filename.
// The filename (`yyyy-MM-dd[-HHmm]-<label>.md`) is authoritative only for the
// datetime; its text label is decorative (it can't hold `:`/`/`/accents that
// real titles do).
//
// Slug source of truth is the file's `slug:` frontmatter. When it's absent
// (derive from the title) or non-canonical (normalize the value itself), the
// parse resolves it through `createSlug` and carries the rewritten file
// content so the shell can write the fix back into the source file — the
// content repo converges to explicit slugs, and a later title edit can never
// silently move a post's URL.

import { parseBulkImportFilename } from "@/lib/api/bulkImportParser"
import { postCreateSchema } from "@/lib/api/schemas"
import { deriveSummary } from "@/lib/content/markdown"
import { parseFrontmatter, setFrontmatterSlug } from "@/lib/import/frontmatter"
import {
	calculateReadingTime,
	createSlug,
	isFutureDatetime,
} from "@/lib/utils/format"
import type { Section } from "@/lib/db/sections"
import type { ZodError } from "zod"

export type ImportFile = {
	filename: string
	content: string
}

/** A pending write-back of the resolved `slug:` line into the source file. */
export type SlugRewrite = {
	/** The full file content with the resolved `slug:` line in place. */
	content: string
	/** The non-canonical value being replaced, or `null` when the file had no `slug:` line. */
	previous: string | null
}

export type ParsedPostFile = {
	filename: string
	title: string
	slug: string
	datetime: string
	body: string
	/** Non-null when the source file's `slug:` line needs writing (missing or normalized); the shell persists it. */
	slugRewrite: SlugRewrite | null
}

export type SkippedFile = {
	filename: string
	reason: string
}

/**
 * Skip reason for an overwrite that resolved to zero field changes. Shared so
 * the importer can roll these up into a count instead of listing every file.
 */
export const UNCHANGED_SKIP_REASON = "Unchanged"

/** The slice of an existing row the overwrite path needs. */
export type ExistingPost = {
	id: number
	title: string
	body: string
	summary: string
	datetime: string
	readingTime: string | null
}

export type PlannedCreate = {
	filename: string
	title: string
	slug: string
	section: Section
	body: string
	summary: string
	datetime: string
	readingTime: string
	published: boolean
}

// `published` is deliberately absent: an overwrite must never flip it. A
// past-dated typo fix would otherwise unpublish a live post via the
// future-dated-means-published creation rule, and a manually-toggled draft
// would silently go live.
export type PostUpdateData = {
	title?: string
	body?: string
	summary?: string
	datetime?: string
	readingTime?: string
}

export type PlannedUpdate = {
	filename: string
	id: number
	slug: string
	data: PostUpdateData
}

export type ImportPlan = {
	creates: PlannedCreate[]
	updates: PlannedUpdate[]
	skipped: SkippedFile[]
}

/**
 * Resolves a file's slug: the explicit `slug:` value when canonical, otherwise
 * `createSlug` applied to the value itself (non-canonical) or to the title
 * (absent) — `createSlug` is idempotent on a well-formed slug, so it doubles
 * as the canonical-shape check. Returns a skip reason instead when the
 * resolution comes out empty.
 */
function resolveSlug(
	fileSlug: string | null,
	title: string
): { slug: string } | { skipReason: string } {
	const slug = createSlug(fileSlug ?? title)

	if (slug === "") {
		return {
			skipReason:
				fileSlug == null
					? "Title produces an empty slug"
					: "`slug:` normalizes to an empty slug",
		}
	}

	return { slug }
}

/**
 * The pending `slug:` write-back for a file, or `null` when its `slug:` line
 * already carries the resolved value verbatim.
 */
function slugRewriteFor(
	content: string,
	fileSlug: string | null,
	slug: string
): SlugRewrite | null {
	if (fileSlug === slug) {
		return null
	}

	return { content: setFrontmatterSlug(content, slug), previous: fileSlug }
}

/**
 * Parses each file into a title (from frontmatter), slug (from frontmatter,
 * resolved through `createSlug`), datetime (from the filename), and body,
 * partitioning out per-file skips: malformed filename, missing frontmatter
 * title, empty slug, in-batch duplicate, empty body. A file whose `slug:` was
 * absent or non-canonical carries a `slugRewrite` with the corrected file
 * content for the shell to persist.
 */
export function parsePostFiles(files: readonly ImportFile[]): {
	parsed: ParsedPostFile[]
	skipped: SkippedFile[]
} {
	const parsed: ParsedPostFile[] = []
	const skipped: SkippedFile[] = []
	const seenSlugs = new Set<string>()

	for (const file of files) {
		const filenameResult = parseBulkImportFilename(file.filename)

		if (!filenameResult.ok) {
			skipped.push({ filename: file.filename, reason: filenameResult.reason })
			continue
		}

		const { title, slug: fileSlug, body } = parseFrontmatter(file.content)

		if (title == null) {
			skipped.push({
				filename: file.filename,
				reason: "Missing `title:` frontmatter",
			})
			continue
		}

		const resolution = resolveSlug(fileSlug, title)

		if ("skipReason" in resolution) {
			skipped.push({ filename: file.filename, reason: resolution.skipReason })
			continue
		}

		const { slug } = resolution

		if (seenSlugs.has(slug)) {
			skipped.push({
				filename: file.filename,
				reason: "Duplicate slug within this batch",
			})
			continue
		}

		if (body.trim() === "") {
			skipped.push({
				filename: file.filename,
				reason: "Body is empty",
			})
			continue
		}

		seenSlugs.add(slug)
		parsed.push({
			filename: file.filename,
			title,
			slug,
			datetime: filenameResult.datetime,
			body,
			slugRewrite: slugRewriteFor(file.content, fileSlug, slug),
		})
	}

	return { parsed, skipped }
}

/**
 * Summary resolution for an overwrite, mirroring the PUT route's intent with
 * no form input available: a stored summary that still equals what the OLD
 * body derives was never hand-refined, so it should track the new body;
 * anything else was authored in the admin and survives the overwrite.
 * Returns `undefined` when the summary column should be left untouched.
 */
function resolveOverwriteSummary(
	existing: ExistingPost,
	newBody: string
): string | undefined {
	const wasDerived = existing.summary === deriveSummary(existing.body)

	if (!wasDerived) {
		return undefined
	}

	const next = deriveSummary(newBody)

	return next === existing.summary ? undefined : next
}

function describeIssues(error: ZodError): string {
	return error.issues
		.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
		.join("; ")
}

type PlanStep =
	| { kind: "create"; create: PlannedCreate }
	| { kind: "update"; update: PlannedUpdate }
	| { kind: "skip"; reason: string }

/**
 * Validates a parsed file against `postCreateSchema` — the same contract the
 * admin API enforces — so a row the admin couldn't have written can't enter
 * through the script either. Returns the formatted issues, or null when valid.
 */
function schemaIssuesFor(
	file: ParsedPostFile,
	section: Section
): string | null {
	const result = postCreateSchema.safeParse({
		title: file.title,
		body: file.body,
		datetime: file.datetime,
		section,
	})

	return result.success ? null : describeIssues(result.error)
}

function planCreate(
	file: ParsedPostFile,
	options: { section: Section; now: string }
): PlanStep {
	const issues = schemaIssuesFor(file, options.section)

	if (issues != null) {
		return { kind: "skip", reason: issues }
	}

	return {
		kind: "create",
		create: {
			filename: file.filename,
			title: file.title,
			slug: file.slug,
			section: options.section,
			body: file.body,
			summary: deriveSummary(file.body),
			datetime: file.datetime,
			readingTime: calculateReadingTime(file.body),
			// Same rule as the bulk endpoint: future-dated files import as
			// published so the scheduled-post auto-surface logic picks them
			// up; past-dated files land as drafts for review.
			published: isFutureDatetime(file.datetime, options.now),
		},
	}
}

function planOverwrite(
	file: ParsedPostFile,
	existing: ExistingPost,
	section: Section
): PlanStep {
	const issues = schemaIssuesFor(file, section)

	if (issues != null) {
		return { kind: "skip", reason: issues }
	}

	const data: PostUpdateData = {}

	if (file.title !== existing.title) {
		data.title = file.title
	}

	if (file.datetime !== existing.datetime) {
		data.datetime = file.datetime
	}

	if (file.body !== existing.body) {
		data.body = file.body

		const readingTime = calculateReadingTime(file.body)

		if (readingTime !== (existing.readingTime ?? "")) {
			data.readingTime = readingTime
		}

		const summary = resolveOverwriteSummary(existing, file.body)

		if (summary != null) {
			data.summary = summary
		}
	}

	if (Object.keys(data).length === 0) {
		return { kind: "skip", reason: UNCHANGED_SKIP_REASON }
	}

	return {
		kind: "update",
		update: { filename: file.filename, id: existing.id, slug: file.slug, data },
	}
}

function planFile(
	file: ParsedPostFile,
	existing: ExistingPost | undefined,
	options: { section: Section; now: string; overwrite: boolean }
): PlanStep {
	if (existing == null) {
		return planCreate(file, options)
	}

	if (!options.overwrite) {
		return {
			kind: "skip",
			reason: "A post with this slug already exists (use --overwrite)",
		}
	}

	return planOverwrite(file, existing, options.section)
}

/**
 * Builds the import plan: creates for unknown slugs, updates for known ones
 * (only with `overwrite`), skips for everything else. Derived fields (summary,
 * readingTime) are computed after schema validation, same as the bulk
 * endpoint. Updates carry only the fields that actually changed, so a re-run
 * over an unchanged folder plans zero writes.
 */
export function planPostImport(
	parsed: ParsedPostFile[],
	existingBySlug: ReadonlyMap<string, ExistingPost>,
	options: { section: Section; now: string; overwrite: boolean }
): ImportPlan {
	const creates: PlannedCreate[] = []
	const updates: PlannedUpdate[] = []
	const skipped: SkippedFile[] = []

	for (const file of parsed) {
		const step = planFile(file, existingBySlug.get(file.slug), options)

		if (step.kind === "create") {
			creates.push(step.create)
		} else if (step.kind === "update") {
			updates.push(step.update)
		} else {
			skipped.push({ filename: file.filename, reason: step.reason })
		}
	}

	return { creates, updates, skipped }
}

/**
 * A line-level multiset diff between two bodies, for the importer's `--verbose`
 * dry-run: `removed` is lines in the DB body not present in the file body,
 * `added` is the reverse. Order-insensitive (a moved line shows as neither), so
 * it's a "what changed" glance, not a formal patch — enough to tell a trivial
 * whitespace drift from a substantive one before deciding to overwrite.
 */
export function diffBodyLines(
	dbBody: string,
	fileBody: string
): { removed: string[]; added: string[] } {
	const countLines = (body: string): Map<string, number> => {
		const counts = new Map<string, number>()

		for (const line of body.split("\n")) {
			counts.set(line, (counts.get(line) ?? 0) + 1)
		}

		return counts
	}

	const dbCounts = countLines(dbBody)
	const fileCounts = countLines(fileBody)
	const excess = (
		source: Map<string, number>,
		other: Map<string, number>
	): string[] => {
		const out: string[] = []

		for (const [line, count] of source) {
			const surplus = count - (other.get(line) ?? 0)

			for (let i = 0; i < surplus; i += 1) {
				out.push(line)
			}
		}

		return out
	}

	return {
		removed: excess(dbCounts, fileCounts),
		added: excess(fileCounts, dbCounts),
	}
}
