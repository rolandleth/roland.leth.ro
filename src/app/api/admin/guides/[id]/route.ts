import { NextResponse } from "next/server"
import {
	handlePrismaError,
	parseIdParam,
	parseJsonBody,
	respondInternalError,
} from "@/lib/api/apiErrors"
import { auditLog } from "@/lib/api/auditLog"
import { guideUpdateSchema } from "@/lib/api/schemas"
import { isPrismaUniqueConstraint, prisma } from "@/lib/db/db"
import { resolvePublishedAt } from "@/lib/db/guideMappers"
import { revalidateTopicsById } from "@/lib/db/guideRevalidation"
import { revalidateGuide } from "@/lib/db/guides"
import {
	describeGuideRefProblem,
	findSlugOwner,
} from "@/lib/db/guideValidation"
import { calculateReadingTime } from "@/lib/utils/format"
import type { z } from "zod"

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const idResult = await parseIdParam(params)

	if (idResult instanceof NextResponse) {
		return idResult
	}

	try {
		const guide = await prisma.guide.findUnique({ where: { id: idResult.id } })

		if (!guide) {
			return NextResponse.json({ error: "Not found" }, { status: 404 })
		}

		return NextResponse.json(guide)
	} catch (error) {
		return respondInternalError("[api:admin:guides:GET]", error)
	}
}

const PUT_TAG = "[api:admin:guides:PUT]"

type GuideUpdate = z.infer<typeof guideUpdateSchema>

/**
 * The checks that must pass before an update lands: cross-table slug ownership,
 * then outward-reference coherence. Returns the response to send when one
 * fails, or null to proceed. Extracted so `PUT` stays under the
 * cognitive-complexity cap.
 */
async function preflight(
	id: number,
	parsed: GuideUpdate,
	existing: { projectSlug: string | null; topicId: number | null }
): Promise<NextResponse | null> {
	if (parsed.slug != null) {
		const owner = await findSlugOwner(parsed.slug, { kind: "guide", id })

		if (owner != null) {
			// eslint-disable-next-line no-console
			console.warn(`${PUT_TAG} slug already exists`, {
				slug: parsed.slug,
				owner,
			})

			return NextResponse.json(
				{ error: `A ${owner} with this slug already exists` },
				{ status: 409 }
			)
		}
	}

	// Effective values, not payload values: a PUT that patches only `topicId`
	// still has to cohere with the project already on the row.
	const refProblem = await describeGuideRefProblem({
		projectSlug:
			parsed.projectSlug !== undefined
				? parsed.projectSlug
				: existing.projectSlug,
		topicId: parsed.topicId !== undefined ? parsed.topicId : existing.topicId,
	})

	if (refProblem != null) {
		// eslint-disable-next-line no-console
		console.warn(`${PUT_TAG} invalid references`, { id })

		return NextResponse.json({ error: refProblem }, { status: 400 })
	}

	return null
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const idResult = await parseIdParam(params)

	if (idResult instanceof NextResponse) {
		return idResult
	}

	const { id } = idResult
	const parsed = await parseJsonBody(request, guideUpdateSchema, PUT_TAG)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	try {
		const existing = await prisma.guide.findUnique({ where: { id } })

		if (existing == null) {
			return NextResponse.json({ error: "Not found" }, { status: 404 })
		}

		const problem = await preflight(id, parsed, existing)

		if (problem != null) {
			return problem
		}

		// Prisma reads `undefined` as "leave this column alone" and `null` as "set
		// null", which is exactly the partial-update semantics we want — so the
		// parsed payload passes through as-is, with only the derived columns added.
		const guide = await prisma.guide.update({
			where: { id },
			data: {
				...parsed,
				readingTime:
					parsed.body != null ? calculateReadingTime(parsed.body) : undefined,
				publishedAt: resolvePublishedAt(
					existing.publishedAt,
					parsed.published,
					new Date()
				),
			},
		})

		revalidateGuide(guide.slug)

		// A rename leaves the old URL cached under its own tag; bust it too, or the
		// previous slug keeps serving until something else evicts it.
		const isRenamed = existing.slug !== guide.slug

		if (isRenamed) {
			revalidateGuide(existing.slug)
		}

		// Both hubs on a move; the same one twice is deduped inside.
		await revalidateTopicsById([existing.topicId, guide.topicId])

		auditLog(PUT_TAG, {
			id: guide.id,
			slug: guide.slug,
			section: null,
			sortOrder: guide.sortOrder,
			previousSection: null,
			previousSlug: isRenamed ? existing.slug : null,
			batchId: null,
		})

		return NextResponse.json(guide)
	} catch (error) {
		if (isPrismaUniqueConstraint(error)) {
			return NextResponse.json(
				{ error: "A guide with this slug already exists" },
				{ status: 409 }
			)
		}

		const notFound = handlePrismaError(error, PUT_TAG)

		if (notFound) {
			return notFound
		}

		return respondInternalError(PUT_TAG, error)
	}
}

const DELETE_TAG = "[api:admin:guides:DELETE]"

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const idResult = await parseIdParam(params)

	if (idResult instanceof NextResponse) {
		return idResult
	}

	const { id } = idResult

	try {
		const deleted = await prisma.guide.delete({ where: { id } })

		revalidateGuide(deleted.slug)
		await revalidateTopicsById([deleted.topicId])

		auditLog(DELETE_TAG, {
			id,
			slug: deleted.slug,
			section: null,
			sortOrder: null,
			previousSection: null,
			previousSlug: null,
			batchId: null,
		})

		return new NextResponse(null, { status: 204 })
	} catch (error) {
		const notFound = handlePrismaError(error, DELETE_TAG)

		if (notFound) {
			return notFound
		}

		return respondInternalError(DELETE_TAG, error)
	}
}
