// Pure, I/O-free core of the post-import script (`scripts/import-posts.ts`).
// Mirrors the `projectImport.ts` split: everything here is deterministic and
// unit-tested; the script is the thin imperative shell that reads files and
// writes to the DB.
//
// Title source of truth is the file's `title:` frontmatter, NOT the filename.
// The filename (`yyyy-MM-dd[-HHmm]-<label>.md`) is authoritative only for the
// datetime; its text label is decorative (it can't hold `:`/`/`/accents that
// real titles do). The slug derives from the frontmatter title, matching how
// the DB's slugs were originally built.

import { parseBulkImportFilename } from "@/lib/api/bulkImportParser"
import { postCreateSchema } from "@/lib/api/schemas"
import { deriveSummary } from "@/lib/content/markdown"
import { parseFrontmatter } from "@/lib/import/frontmatter"
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

export type ParsedPostFile = {
	filename: string
	title: string
	slug: string
	datetime: string
	body: string
}

export type SkippedFile = {
	filename: string
	reason: string
}

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
 * Parses each file into a title (from frontmatter), slug, datetime (from the
 * filename), and body, partitioning out per-file skips: malformed filename,
 * missing frontmatter title, empty slug, in-batch duplicate, empty body. The
 * title comes from the `title:` frontmatter — the filename is read only for
 * the datetime.
 */
export function parsePostFiles(files: ImportFile[]): {
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

		const { title, body } = parseFrontmatter(file.content)

		if (title == null) {
			skipped.push({
				filename: file.filename,
				reason: "Missing `title:` frontmatter",
			})
			continue
		}

		const slug = createSlug(title)

		if (slug === "") {
			skipped.push({
				filename: file.filename,
				reason: "Title produces an empty slug",
			})
			continue
		}

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
		return { kind: "skip", reason: "Unchanged" }
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
