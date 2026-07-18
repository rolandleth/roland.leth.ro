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
// A guide's filename carries its publication date (`yyyy-MM-dd[-HHmm]-Title.md`),
// exactly as a post's does, and that date IS `publishedAt`. Authored rather than
// stamped at import time: otherwise the date depends on when the import happened
// to run, and re-importing into a fresh database would silently re-age every
// guide. `index.md` needs no date — a topic has no publication date of its own,
// and it still sorts last in its folder because every sibling starts with a digit.
//
// The filename's *title* text stays decorative, same as a post's: it can't hold
// the `:`/`/`/accents a real title does. Slug and title come from frontmatter,
// always, so renaming a file can never move a published URL.
//
// Departures from the post importer, all for the same reason — a guide's slug is
// authored to match a search query and is permanent once indexed:
//  - `slug:` is required and validated, never derived from the title and never
//    normalized on the author's behalf;
//  - no publish-state inference: importing a file is the decision to publish it,
//    which is what `drafts/` is for. A future-dated file still imports as
//    `published: true` — the read paths then hold it back until its date passes
//    (`isScheduledGuide`), exactly as they do for a scheduled post. Posts flip
//    `published` off for past-dated files; guides don't, because `drafts/`
//    already says that.

import { parseBulkImportFilename } from "@/lib/api/bulkImportParser"
import { guideCreateSchema, guideTopicCreateSchema } from "@/lib/api/schemas"
import { parseFrontmatterFields } from "@/lib/import/frontmatter"
import { calculateReadingTime, datetimeToUtcDate } from "@/lib/utils/format"
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
	/** Basename only — the date prefix a guide's `publishedAt` is read from. */
	filename: string
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
	/** From the filename's date prefix, at UTC midnight unless it carries an `HHmm`. */
	publishedAt: Date
}

export interface SkippedFile {
	relativePath: string
	reason: string
}

/**
 * A file that imports fine but probably isn't what the author meant. Distinct
 * from a skip: the row still gets written, and the run still succeeds.
 */
export interface GuideWarning {
	relativePath: string
	message: string
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
	/** The guide's CURRENT topic slug (null when ungrouped), for detecting a move
	 * to a different folder even when the content is otherwise unchanged. */
	topicSlug: string | null
	sortOrder: number
	readingTime: string | null
	publishedAt: Date | null
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
	publishedAt: Date
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
		publishedAt?: Date
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
/** Postgres `INTEGER` (INT4) upper bound; a `sortOrder` above it can't be stored. */
const MAX_SORT_ORDER = 2_147_483_647

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

	const value = Number.parseInt(raw, 10)

	// Postgres `INTEGER` (INT4) upper bound. Above this the write fails at insert
	// with an opaque driver error; reject it here so the failure names its file.
	if (value > MAX_SORT_ORDER) {
		return {
			error: `\`sortOrder\` must be at most ${MAX_SORT_ORDER}, got "${raw}"`,
		}
	}

	return { value }
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
	// The filename's date IS `publishedAt`, so a file without one has no
	// publication date to import — a loud skip, not a silent `new Date()`.
	// `parseBulkImportFilename` is the posts' parser: same convention, and it
	// already rejects `2026-02-31`, an out-of-range time, and control characters.
	const filenameResult = parseBulkImportFilename(file.filename)

	if (!filenameResult.ok) {
		return { relativePath: file.relativePath, reason: filenameResult.reason }
	}

	const publishedAt = datetimeToUtcDate(filenameResult.datetime)

	if (publishedAt == null) {
		return {
			relativePath: file.relativePath,
			reason: `Unparseable date in filename: ${filenameResult.datetime}`,
		}
	}

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
		publishedAt,
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
	warnings: GuideWarning[]
} {
	const topics: ParsedTopic[] = []
	const guides: ParsedGuide[] = []
	const skipped: SkippedFile[] = []
	const warnings: GuideWarning[] = []
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

	warnings.push(...projectLinkWarnings(topics, guides))

	return { topics, guides, skipped, warnings }
}

/**
 * Collects the project-link warnings across a parsed batch. A topic's body is
 * its `description` (the hub landing page); a guide's is its `body`. Both are
 * checked because both render a product link as prose, not a card.
 */
function projectLinkWarnings(
	topics: readonly ParsedTopic[],
	guides: readonly ParsedGuide[]
): GuideWarning[] {
	const pages = [
		...topics.map((topic) => ({
			relativePath: topic.relativePath,
			projectSlug: topic.projectSlug,
			body: topic.description,
		})),
		...guides,
	]

	return pages
		.map(projectLinkWarningFor)
		.filter((warning): warning is GuideWarning => warning != null)
}

/**
 * Warns when a page names a project but its body never links to it.
 *
 * The product link and the disclosure that carries it live in the prose, on
 * purpose — they're per-page and contextual, and a rendered card would be
 * boilerplate that never actually says who made the thing. The cost of that
 * choice is that forgetting the paragraph is silent: the page ships with no
 * product link and no disclosure, which is the worst of both. This is the check
 * that buys the guarantee back without putting a widget on the page.
 *
 * A warning, never a skip: the page is still perfectly good, and refusing to
 * import over a missing link would be wildly out of proportion.
 */
function projectLinkWarningFor(entry: {
	relativePath: string
	projectSlug: string | null
	body: string
}): GuideWarning | null {
	if (
		entry.projectSlug == null ||
		bodyLinksToProject(entry.body, entry.projectSlug)
	) {
		return null
	}

	return {
		relativePath: entry.relativePath,
		message: `Names project \`${entry.projectSlug}\` but the body never links to /projects/${entry.projectSlug} — so this page has no product link and no disclosure. Intended?`,
	}
}

/**
 * Whether a body links to a project's page. A substring check rather than a full
 * markdown parse: both an inline `[Reckon](/projects/reckon)` and a reference
 * definition `[reckon]: /projects/reckon "…"` contain the literal path, and this
 * runs on every import.
 *
 * Fenced and inline code are stripped first, so a `/projects/reckon` shown as a
 * code example doesn't read as a real link and wrongly suppress the "guide has no
 * product link" warning. (Prose that merely names the path — "don't link to
 * /projects/reckon" — still counts; distinguishing that needs real parsing and is
 * a rare enough case to accept.)
 *
 * The trailing boundary stops `/projects/reckon` from matching inside
 * `/projects/reckon-pro`. Interpolating the slug into a regex is safe here: it
 * has already been validated as canonical (`[a-z0-9]` and hyphens), so it can't
 * carry a metacharacter.
 */
function bodyLinksToProject(body: string, projectSlug: string): boolean {
	const prose = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "")

	return new RegExp(`/projects/${projectSlug}(?![a-z0-9-])`).test(prose)
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
	overwrite: boolean,
	/** Slug of the topic the guide's folder maps to (null when ungrouped). */
	targetTopicSlug: string | null
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
				publishedAt: guide.publishedAt,
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

	// The filename owns the publication date, so an overwrite re-syncs it: the
	// author renaming a file to a different date means it. This is the one place
	// `publishedAt` moves after creation — the admin path stamps it once and
	// never rewrites it (`resolvePublishedAt`), because there it's an artifact of
	// clicking Publish rather than something anyone chose.
	if (existing.publishedAt?.getTime() !== guide.publishedAt.getTime()) {
		data.publishedAt = guide.publishedAt
	}

	if (guide.body !== existing.body) {
		data.body = guide.body

		if (guide.readingTime !== (existing.readingTime ?? "")) {
			data.readingTime = guide.readingTime
		}
	}

	// `published` is deliberately absent: an overwrite must never flip it, or
	// re-importing an edited file would silently republish something staged.

	// A pure folder move (new topic, byte-identical content) leaves `data` empty
	// but must still update, or the guide keeps its old `topicId`. Compare by slug:
	// the file's target topic (folder → slug) vs. the row's current topic. The
	// shell resolves `topicFolder` → `topicId` and applies it on the update path,
	// so carrying the folder is enough — no `topicId` field in `data`.
	const isTopicChanged = targetTopicSlug !== existing.topicSlug

	if (Object.keys(data).length === 0 && !isTopicChanged) {
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
 * A guide's target topic (its folder → slug) is compared against its current
 * topic slug so a pure move re-groups even with unchanged content; the shell
 * resolves `topicFolder` to a `topicId` after topics are written and applies it.
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

	// Folder → topic slug for this run. Every importable grouped guide's folder is
	// guaranteed to have a parsed topic (the parser skips guides whose folder has
	// no `index.md`), so a non-null folder always resolves here.
	const topicSlugByFolder = new Map(
		parsed.topics.map((topic) => [topic.folder, topic.slug])
	)

	for (const guide of parsed.guides) {
		const targetTopicSlug =
			guide.topicFolder == null
				? null
				: (topicSlugByFolder.get(guide.topicFolder) ?? null)
		const step = planGuide(
			guide,
			existing.guidesBySlug.get(guide.slug),
			options.overwrite,
			targetTopicSlug
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
