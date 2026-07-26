import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { parseJsonBody, respondInternalError } from "@/lib/api/apiErrors"
import { auditLog } from "@/lib/api/auditLog"
import { requireAdmin } from "@/lib/api/requireAdmin"
import { postBulkImportSchema } from "@/lib/api/schemas"
import { deriveSummary } from "@/lib/content/markdown"
import { prisma } from "@/lib/db/db"
import { revalidatePostSection } from "@/lib/db/posts"
import { parsePostFiles, type SkippedFile } from "@/lib/import/postImport"
import {
	calculateReadingTime,
	currentDatetimeString,
	isFutureDatetime,
} from "@/lib/utils/format"
import type { Section } from "@/lib/db/sections"

// DB-shaped insert row. The originating filename is kept out of this type so
// it can never accidentally leak into the Prisma `data` payload — see the
// parallel `slugToFilename` map below for the audit-report lookup.
interface InsertRow {
	title: string
	slug: string
	body: string
	summary: string
	datetime: string
	section: Section
	published: boolean
	readingTime: string
}

interface PreparedBatch {
	toInsert: InsertRow[]
	skipped: SkippedFile[]
	slugToFilename: Map<string, string>
}

/**
 * Runs the batch through `parsePostFiles` — the import script's parse/gate
 * pipeline, shared so the two ingestion paths can't drift on which files
 * import and under what slug — then maps the survivors to DB-shaped insert
 * rows. `slugRewrite` is deliberately dropped: an upload can't be written
 * back, so a missing `slug:` is derived here without a file fix-up.
 */
function prepareBatch(
	files: ReadonlyArray<{ filename: string; content: string }>,
	section: Section,
	now: string
): PreparedBatch {
	const { parsed, skipped } = parsePostFiles(files)

	const slugToFilename = new Map(
		parsed.map((file): [string, string] => [file.slug, file.filename])
	)
	const toInsert: InsertRow[] = parsed.map((file) => ({
		title: file.title,
		slug: file.slug,
		body: file.body,
		// Bulk import has no per-file summary input — the frontmatter carries
		// only the title and slug. Always derive so the OG meta description and
		// feed `<summary>` are populated. Author can refine via the admin edit
		// form afterwards.
		summary: deriveSummary(file.body),
		datetime: file.datetime,
		section,
		// Future-dated posts are published so the existing scheduled-post
		// auto-surface logic in `getPostsBySection` picks them up the moment
		// their `datetime` passes. Past-dated posts default to draft so the
		// admin reviews each before promoting it.
		published: isFutureDatetime(file.datetime, now),
		readingTime: calculateReadingTime(file.body),
	}))

	return { toInsert, skipped, slugToFilename }
}

/**
 * Counts skip reasons by category so a "wrong folder selected" 50-file batch
 * leaves a single, greppable log line instead of being reconstructed from the
 * per-file response.
 */
function summarizeSkipReasons(
	skipped: ReadonlyArray<SkippedFile>
): Record<string, number> {
	const out: Record<string, number> = {}

	for (const item of skipped) {
		out[item.reason] = (out[item.reason] ?? 0) + 1
	}

	return out
}

function emitSkipSummary(
	batchId: string,
	section: Section,
	skipped: ReadonlyArray<SkippedFile>
): void {
	if (skipped.length === 0) {
		return
	}

	// eslint-disable-next-line no-console
	console.info("[api:admin:posts:BULK] skipped", {
		batchId,
		section,
		count: skipped.length,
		reasonsByType: summarizeSkipReasons(skipped),
	})
}

export async function POST(request: Request): Promise<NextResponse> {
	const unauthorized = await requireAdmin("[api:admin:posts:BULK]")

	if (unauthorized) {
		return unauthorized
	}

	const parsed = await parseJsonBody(
		request,
		postBulkImportSchema,
		"[api:admin:posts:BULK]"
	)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	const { section, files } = parsed
	const batchId = randomUUID()
	// Captured once so every per-file comparison uses the same instant and a
	// 0:00:01 race doesn't flip one file's auto-publish.
	const now = currentDatetimeString()

	const { toInsert, skipped, slugToFilename } = prepareBatch(
		files,
		section,
		now
	)

	if (toInsert.length === 0) {
		emitSkipSummary(batchId, section, skipped)

		return NextResponse.json({ created: 0, skipped }, { status: 200 })
	}

	try {
		const existing = await prisma.post.findMany({
			where: { section, slug: { in: toInsert.map((p) => p.slug) } },
			select: { slug: true },
		})
		const existingSlugs = new Set(existing.map((row) => row.slug))

		const filteredInsert: InsertRow[] = []
		for (const row of toInsert) {
			if (existingSlugs.has(row.slug)) {
				skipped.push({
					filename: slugToFilename.get(row.slug) ?? row.slug,
					reason: "A post with this slug already exists",
				})
				continue
			}
			filteredInsert.push(row)
		}

		if (filteredInsert.length === 0) {
			emitSkipSummary(batchId, section, skipped)

			return NextResponse.json({ created: 0, skipped }, { status: 200 })
		}

		// One pre-insert breadcrumb so a 500 in the next call still tells us
		// which slugs were in-flight. Without this, `respondInternalError`
		// returns a generic 500 and the prepared list is lost.
		// eslint-disable-next-line no-console
		console.info("[api:admin:posts:BULK] inserting", {
			batchId,
			section,
			count: filteredInsert.length,
			slugs: filteredInsert.map((r) => r.slug),
		})

		// `skipDuplicates: true` is belt-and-suspenders against a concurrent
		// admin write between our pre-query and this insert. Practically
		// impossible at single-admin volumes, but the failure mode without
		// it is a thrown unique-constraint that aborts the entire batch.
		const created = await prisma.post.createManyAndReturn({
			data: filteredInsert,
			skipDuplicates: true,
			select: { id: true, slug: true, section: true },
		})

		// Reconcile: if `skipDuplicates` ate any row (concurrent write between
		// the pre-query and the insert), surface the dropped filename in
		// `skipped` instead of letting "created N" hide the loss.
		if (created.length < filteredInsert.length) {
			const createdSlugs = new Set(created.map((row) => row.slug))
			for (const row of filteredInsert) {
				if (!createdSlugs.has(row.slug)) {
					skipped.push({
						filename: slugToFilename.get(row.slug) ?? row.slug,
						reason: "Skipped at insert (concurrent write)",
					})
				}
			}
		}

		revalidatePostSection(section)

		// One audit line per created row keeps the post POST/PUT/DELETE shape
		// consistent — log aggregators don't need a special parser for bulk.
		// `batchId` collapses all lines from this run into one greppable unit.
		for (const row of created) {
			auditLog("[api:admin:posts:BULK]", {
				id: row.id,
				slug: row.slug,
				section: row.section,
				sortOrder: null,
				previousSection: null,
				previousSlug: null,
				batchId,
			})
		}

		emitSkipSummary(batchId, section, skipped)

		return NextResponse.json(
			{ created: created.length, skipped },
			{ status: 200 }
		)
	} catch (error) {
		return respondInternalError("[api:admin:posts:BULK]", error)
	}
}
