import { NextResponse } from "next/server"
import { parseJsonBody, respondInternalError } from "@/lib/apiErrors"
import { auditLog } from "@/lib/auditLog"
import { parseBulkImportFilename } from "@/lib/bulkImportParser"
import { prisma } from "@/lib/db"
import {
	calculateReadingTime,
	createSlug,
	currentDatetimeString,
} from "@/lib/format"
import { revalidatePostSection } from "@/lib/posts"
import { postBulkImportSchema } from "@/lib/schemas"
import type { Section } from "@/lib/sections"

interface SkippedFile {
	filename: string
	reason: string
}

interface PreparedRow {
	filename: string
	title: string
	slug: string
	body: string
	datetime: string
	section: Section
	published: boolean
	readingTime: string
}

export async function POST(request: Request): Promise<NextResponse> {
	const parsed = await parseJsonBody(
		request,
		postBulkImportSchema,
		"[api:admin:posts:BULK]"
	)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	const { section, files } = parsed
	const now = currentDatetimeString()

	const prepared: PreparedRow[] = []
	const skipped: SkippedFile[] = []

	// Per-file slug duplication WITHIN this batch is a guaranteed unique-constraint
	// violation downstream; catch it here so the user gets one clear "duplicate
	// filename" message instead of a generic insert failure for every collision.
	const seenSlugs = new Set<string>()

	for (const file of files) {
		const result = parseBulkImportFilename(file.filename)

		if (!result.ok) {
			skipped.push({ filename: file.filename, reason: result.reason })
			continue
		}

		const slug = createSlug(result.title)

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

		seenSlugs.add(slug)

		prepared.push({
			filename: file.filename,
			title: result.title,
			slug,
			body: file.content,
			datetime: result.datetime,
			section,
			// Future-dated posts are published so the existing scheduled-post
			// auto-surface logic in `getPostsBySection` picks them up the moment
			// their `datetime` passes. Past-dated posts default to draft so the
			// admin reviews each before promoting it.
			published: result.datetime > now,
			readingTime: calculateReadingTime(file.content),
		})
	}

	if (prepared.length === 0) {
		return NextResponse.json({ created: 0, skipped }, { status: 200 })
	}

	try {
		const existing = await prisma.post.findMany({
			where: { section, slug: { in: prepared.map((p) => p.slug) } },
			select: { slug: true },
		})
		const existingSlugs = new Set(existing.map((row) => row.slug))

		const toInsert: PreparedRow[] = []
		for (const row of prepared) {
			if (existingSlugs.has(row.slug)) {
				skipped.push({
					filename: row.filename,
					reason: "A post with this slug already exists",
				})
				continue
			}
			toInsert.push(row)
		}

		if (toInsert.length === 0) {
			return NextResponse.json({ created: 0, skipped }, { status: 200 })
		}

		// `skipDuplicates: true` is belt-and-suspenders against a concurrent
		// admin write between our pre-query and this insert. Practically
		// impossible at single-admin volumes, but the failure mode without
		// it is a thrown unique-constraint that aborts the entire batch.
		const created = await prisma.post.createManyAndReturn({
			data: toInsert.map(({ filename: _filename, ...data }) => data),
			skipDuplicates: true,
			select: { id: true, slug: true, section: true },
		})

		revalidatePostSection(section)

		// One audit line per created row keeps the post POST/PUT/DELETE shape
		// consistent — log aggregators don't need a special parser for bulk.
		for (const row of created) {
			auditLog("[api:admin:posts:BULK]", {
				id: row.id,
				slug: row.slug,
				section: row.section,
				sortOrder: null,
				previousSection: null,
				previousSlug: null,
			})
		}

		return NextResponse.json(
			{ created: created.length, skipped },
			{ status: 200 }
		)
	} catch (error) {
		return respondInternalError("[api:admin:posts:BULK]", error)
	}
}
