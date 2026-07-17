// Pure, I/O-free core of guide ingestion. Mirrors the `postImport.ts` split:
// everything here is deterministic and unit-tested; `scripts/import-guides.ts`
// is the thin imperative shell that walks the folder and writes to the DB.
//
// Source layout — the directory *is* the grouping:
//
//   guides/
//     2026-07-17-How calibrated are you.md    ungrouped guide
//     making-better-decisions/
//       2026-07-17-How to keep a decision journal.md
//       index.md                              the topic hub
//     drafts/                                 never imported
//
// Filenames carry a `yyyy-MM-dd-` prefix for disk sorting only — this parser
// ignores them entirely (`index.md` sorts last in a topic folder for the same
// reason: every sibling starts with a digit). Slug and title come from
// frontmatter, always, so renaming a file can never move a published URL.
//
// Departures from the post importer, all for the same reason — a guide's slug is
// authored to match a search query and is permanent once indexed:
//  - `slug:` is required and validated, never derived from the title and never
//    normalized on the author's behalf;
//  - no publish-state inference: importing a file is the decision to publish it,
//    which is what `drafts/` is for.

import { guideCreateSchema, guideTopicCreateSchema } from "@/lib/api/schemas"
import { parseFrontmatterFields } from "@/lib/import/frontmatter"
import { calculateReadingTime } from "@/lib/utils/format"
import type { ZodError } from "zod"

/** The folder whose contents never import, by convention. */
export const DRAFTS_FOLDER = "drafts"

/** The file that declares a folder's topic. */
export const TOPIC_FILENAME = "index.md"

const TOPIC_KEYS = ["slug", "title", "shortDescription", "project"] as const
const UNGROUPED_GUIDE_KEYS = [
	"slug",
	"title",
	"description",
	"project",
	"sortOrder",
] as const
// A guide inside a topic folder inherits the topic's project, so declaring one
// here is redundant at best and a contradiction at worst — the DB rejects a
// guide whose project disagrees with its topic's. Leaving `project` out of the
// allowed set turns that into a parse error naming the fix.
const GROUPED_GUIDE_KEYS = [
	"slug",
	"title",
	"description",
	"sortOrder",
] as const

export interface GuideSourceFile {
	/** Path relative to the guides root, e.g. `making-better-decisions/index.md`. */
	relativePath: string
	content: string
	/** The containing topic folder, or null for a file at the root. */
	topicFolder: string | null
	/** True for a folder's `index.md`. */
	isTopicFile: boolean
}

export interface ParsedTopic {
	relativePath: string
	folder: string
	slug: string
	title: string
	shortDescription: string
	description: string
	projectSlug: string | null
}

export interface ParsedGuide {
	relativePath: string
	slug: string
	title: string
	description: string
	body: string
	/** The folder that groups this guide, or null when ungrouped. */
	topicFolder: string | null
	/** Own `project:` when ungrouped, inherited from the topic when grouped. */
	projectSlug: string | null
	sortOrder: number
	readingTime: string
}

export interface SkippedFile {
	relativePath: string
	reason: string
}

/** Skip reason for an overwrite that resolved to zero field changes. */
export const UNCHANGED_SKIP_REASON = "Unchanged"

export interface ExistingTopic {
	id: number
	title: string
	shortDescription: string
	description: string
	projectSlug: string | null
}

export interface ExistingGuide {
	id: number
	title: string
	description: string
	body: string
	projectSlug: string | null
	topicId: number | null
	sortOrder: number
	readingTime: string | null
}

export interface PlannedTopicCreate {
	relativePath: string
	slug: string
	title: string
	shortDescription: string
	description: string
	projectSlug: string | null
}

export interface PlannedTopicUpdate {
	relativePath: string
	id: number
	slug: string
	data: Partial<Omit<PlannedTopicCreate, "relativePath" | "slug">>
}

export interface PlannedGuideCreate {
	relativePath: string
	slug: string
	title: string
	description: string
	body: string
	projectSlug: string | null
	/** Resolved to a `topicId` by the shell, once topics are written. */
	topicFolder: string | null
	sortOrder: number
	readingTime: string
}

export interface PlannedGuideUpdate {
	relativePath: string
	id: number
	slug: string
	topicFolder: string | null
	data: {
		title?: string
		description?: string
		body?: string
		projectSlug?: string | null
		sortOrder?: number
		readingTime?: string
	}
}

export interface GuideImportPlan {
	topicCreates: PlannedTopicCreate[]
	topicUpdates: PlannedTopicUpdate[]
	guideCreates: PlannedGuideCreate[]
	guideUpdates: PlannedGuideUpdate[]
	skipped: SkippedFile[]
}

// #region parsing

function describeIssues(error: ZodError): string {
	return error.issues
		.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
		.join("; ")
}

/**
 * Parses `sortOrder` strictly. A non-integer is a loud skip rather than a
 * coerced 0: silently collapsing `sortOrder: 1.5` (or a typo'd `sortOrder: one`)
 * to 0 would reorder a topic's guides with nothing in the output to explain it.
 */
function parseSortOrder(
	raw: string | undefined
): { value: number } | { error: string } {
	if (raw == null) {
		return { value: 0 }
	}

	if (!/^\d+$/.test(raw)) {
		return {
			error: `\`sortOrder\` must be a non-negative integer, got "${raw}"`,
		}
	}

	return { value: Number.parseInt(raw, 10) }
}

function parseTopicFile(file: GuideSourceFile): ParsedTopic | SkippedFile {
	const result = parseFrontmatterFields(file.content, TOPIC_KEYS)

	if (!result.ok) {
		return { relativePath: file.relativePath, reason: result.error }
	}

	const { fields, body } = result
	const candidate = {
		slug: fields.slug ?? "",
		title: fields.title ?? "",
		shortDescription: fields.shortDescription ?? "",
		description: body,
		projectSlug: fields.project ?? null,
	}

	// Validated against the same schema the admin API enforces, so a row the
	// admin couldn't have written can't enter through the script either.
	const validation = guideTopicCreateSchema.safeParse(candidate)

	if (!validation.success) {
		return {
			relativePath: file.relativePath,
			reason: describeIssues(validation.error),
		}
	}

	return {
		relativePath: file.relativePath,
		// `file.topicFolder` is non-null for any file the walker marked a topic.
		folder: file.topicFolder ?? "",
		...candidate,
	}
}

function parseGuideFile(
	file: GuideSourceFile,
	topicProjectSlug: string | null | undefined
): ParsedGuide | SkippedFile {
	const isGrouped = file.topicFolder != null
	const result = parseFrontmatterFields(
		file.content,
		isGrouped ? GROUPED_GUIDE_KEYS : UNGROUPED_GUIDE_KEYS
	)

	if (!result.ok) {
		return { relativePath: file.relativePath, reason: result.error }
	}

	const { fields, body } = result
	const sortOrder = parseSortOrder(fields.sortOrder)

	if ("error" in sortOrder) {
		return { relativePath: file.relativePath, reason: sortOrder.error }
	}

	// Grouped guides inherit; ungrouped declare their own.
	const projectSlug = isGrouped
		? (topicProjectSlug ?? null)
		: (fields.project ?? null)

	const candidate = {
		slug: fields.slug ?? "",
		title: fields.title ?? "",
		description: fields.description ?? "",
		body,
		projectSlug,
		sortOrder: sortOrder.value,
	}

	const validation = guideCreateSchema.safeParse(candidate)

	if (!validation.success) {
		return {
			relativePath: file.relativePath,
			reason: describeIssues(validation.error),
		}
	}

	return {
		relativePath: file.relativePath,
		...candidate,
		topicFolder: file.topicFolder,
		readingTime: calculateReadingTime(body),
	}
}

function isSkip(value: object): value is SkippedFile {
	return "reason" in value
}

/**
 * Parses every source file into topics and guides, partitioning out per-file
 * skips. Topics are parsed first so each grouped guide can inherit its topic's
 * project; a guide in a folder with no readable `index.md` is skipped rather
 * than silently imported ungrouped — that would put it on the wrong pages.
 *
 * Slug collisions are caught here across BOTH kinds, since guides and topics
 * share one flat `/guides/:slug` namespace and the database has no cross-table
 * unique constraint to fall back on.
 */
export function parseGuideFiles(files: readonly GuideSourceFile[]): {
	topics: ParsedTopic[]
	guides: ParsedGuide[]
	skipped: SkippedFile[]
} {
	const topics: ParsedTopic[] = []
	const guides: ParsedGuide[] = []
	const skipped: SkippedFile[] = []
	const seenSlugs = new Map<string, string>()

	function claimSlug(slug: string, relativePath: string): boolean {
		const owner = seenSlugs.get(slug)

		if (owner != null) {
			skipped.push({
				relativePath,
				reason: `Slug "${slug}" is already used by ${owner} in this batch`,
			})

			return false
		}

		seenSlugs.set(slug, relativePath)

		return true
	}

	for (const file of files.filter((candidate) => candidate.isTopicFile)) {
		const parsed = parseTopicFile(file)

		if (isSkip(parsed)) {
			skipped.push(parsed)
			continue
		}

		if (claimSlug(parsed.slug, parsed.relativePath)) {
			topics.push(parsed)
		}
	}

	const projectByFolder = new Map(
		topics.map((topic) => [topic.folder, topic.projectSlug])
	)

	for (const file of files.filter((candidate) => !candidate.isTopicFile)) {
		if (file.topicFolder != null && !projectByFolder.has(file.topicFolder)) {
			skipped.push({
				relativePath: file.relativePath,
				reason: `Its folder has no importable \`${TOPIC_FILENAME}\`, so there's no topic to join`,
			})
			continue
		}

		const parsed = parseGuideFile(
			file,
			file.topicFolder == null ? null : projectByFolder.get(file.topicFolder)
		)

		if (isSkip(parsed)) {
			skipped.push(parsed)
			continue
		}

		if (claimSlug(parsed.slug, parsed.relativePath)) {
			guides.push(parsed)
		}
	}

	return { topics, guides, skipped }
}

// #endregion

// #region planning

function planTopic(
	topic: ParsedTopic,
	existing: ExistingTopic | undefined,
	overwrite: boolean
):
	| { kind: "create"; create: PlannedTopicCreate }
	| { kind: "update"; update: PlannedTopicUpdate }
	| { kind: "skip"; reason: string } {
	if (existing == null) {
		return {
			kind: "create",
			create: {
				relativePath: topic.relativePath,
				slug: topic.slug,
				title: topic.title,
				shortDescription: topic.shortDescription,
				description: topic.description,
				projectSlug: topic.projectSlug,
			},
		}
	}

	if (!overwrite) {
		return {
			kind: "skip",
			reason: "A topic with this slug already exists (use --overwrite)",
		}
	}

	const data: PlannedTopicUpdate["data"] = {}

	if (topic.title !== existing.title) {
		data.title = topic.title
	}

	if (topic.shortDescription !== existing.shortDescription) {
		data.shortDescription = topic.shortDescription
	}

	if (topic.description !== existing.description) {
		data.description = topic.description
	}

	if (topic.projectSlug !== existing.projectSlug) {
		data.projectSlug = topic.projectSlug
	}

	if (Object.keys(data).length === 0) {
		return { kind: "skip", reason: UNCHANGED_SKIP_REASON }
	}

	return {
		kind: "update",
		update: {
			relativePath: topic.relativePath,
			id: existing.id,
			slug: topic.slug,
			data,
		},
	}
}

function planGuide(
	guide: ParsedGuide,
	existing: ExistingGuide | undefined,
	overwrite: boolean
):
	| { kind: "create"; create: PlannedGuideCreate }
	| { kind: "update"; update: PlannedGuideUpdate }
	| { kind: "skip"; reason: string } {
	if (existing == null) {
		return {
			kind: "create",
			create: {
				relativePath: guide.relativePath,
				slug: guide.slug,
				title: guide.title,
				description: guide.description,
				body: guide.body,
				projectSlug: guide.projectSlug,
				topicFolder: guide.topicFolder,
				sortOrder: guide.sortOrder,
				readingTime: guide.readingTime,
			},
		}
	}

	if (!overwrite) {
		return {
			kind: "skip",
			reason: "A guide with this slug already exists (use --overwrite)",
		}
	}

	const data: PlannedGuideUpdate["data"] = {}

	if (guide.title !== existing.title) {
		data.title = guide.title
	}

	if (guide.description !== existing.description) {
		data.description = guide.description
	}

	if (guide.projectSlug !== existing.projectSlug) {
		data.projectSlug = guide.projectSlug
	}

	if (guide.sortOrder !== existing.sortOrder) {
		data.sortOrder = guide.sortOrder
	}

	if (guide.body !== existing.body) {
		data.body = guide.body

		if (guide.readingTime !== (existing.readingTime ?? "")) {
			data.readingTime = guide.readingTime
		}
	}

	// `published` is deliberately absent: an overwrite must never flip it, or
	// re-importing an edited file would silently republish something staged.
	if (Object.keys(data).length === 0) {
		return { kind: "skip", reason: UNCHANGED_SKIP_REASON }
	}

	return {
		kind: "update",
		update: {
			relativePath: guide.relativePath,
			id: existing.id,
			slug: guide.slug,
			topicFolder: guide.topicFolder,
			data,
		},
	}
}

/**
 * Builds the import plan: creates for unknown slugs, updates for known ones
 * (only with `overwrite`), skips for everything else. Updates carry only the
 * fields that actually changed, so a re-run over an unchanged folder plans zero
 * writes.
 *
 * Topic membership is NOT diffed here — the shell resolves `topicFolder` to a
 * `topicId` after topics are written, and applies it on both paths.
 */
export function planGuideImport(
	parsed: { topics: readonly ParsedTopic[]; guides: readonly ParsedGuide[] },
	existing: {
		topicsBySlug: ReadonlyMap<string, ExistingTopic>
		guidesBySlug: ReadonlyMap<string, ExistingGuide>
	},
	options: { overwrite: boolean }
): GuideImportPlan {
	const plan: GuideImportPlan = {
		topicCreates: [],
		topicUpdates: [],
		guideCreates: [],
		guideUpdates: [],
		skipped: [],
	}

	for (const topic of parsed.topics) {
		const step = planTopic(
			topic,
			existing.topicsBySlug.get(topic.slug),
			options.overwrite
		)

		if (step.kind === "create") {
			plan.topicCreates.push(step.create)
		} else if (step.kind === "update") {
			plan.topicUpdates.push(step.update)
		} else {
			plan.skipped.push({
				relativePath: topic.relativePath,
				reason: step.reason,
			})
		}
	}

	for (const guide of parsed.guides) {
		const step = planGuide(
			guide,
			existing.guidesBySlug.get(guide.slug),
			options.overwrite
		)

		if (step.kind === "create") {
			plan.guideCreates.push(step.create)
		} else if (step.kind === "update") {
			plan.guideUpdates.push(step.update)
		} else {
			plan.skipped.push({
				relativePath: guide.relativePath,
				reason: step.reason,
			})
		}
	}

	return plan
}

// #endregion
