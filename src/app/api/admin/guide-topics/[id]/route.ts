import { NextResponse } from "next/server"
import {
	handlePrismaError,
	parseIdParam,
	parseJsonBody,
	respondInternalError,
} from "@/lib/api/apiErrors"
import { auditLog } from "@/lib/api/auditLog"
import { requireAdmin } from "@/lib/api/requireAdmin"
import { guideTopicUpdateSchema } from "@/lib/api/schemas"
import {
	isPrismaForeignKeyConstraint,
	isPrismaUniqueConstraint,
	prisma,
} from "@/lib/db/db"
import { revalidateGuideTopic } from "@/lib/db/guides"
import {
	describeTopicRefProblem,
	findSlugOwner,
} from "@/lib/db/guideValidation"
import type { z } from "zod"

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const unauthorized = await requireAdmin("[api:admin:guide-topics:GET]")

	if (unauthorized) {
		return unauthorized
	}

	const idResult = await parseIdParam(params)

	if (idResult instanceof NextResponse) {
		return idResult
	}

	try {
		const topic = await prisma.guideTopic.findUnique({
			where: { id: idResult.id },
		})

		if (!topic) {
			return NextResponse.json({ error: "Not found" }, { status: 404 })
		}

		return NextResponse.json(topic)
	} catch (error) {
		return respondInternalError("[api:admin:guide-topics:GET]", error)
	}
}

const PUT_TAG = "[api:admin:guide-topics:PUT]"

type GuideTopicUpdate = z.infer<typeof guideTopicUpdateSchema>

/**
 * The checks that must pass before an update lands: cross-table slug ownership,
 * then the project reference. Returns the response to send when one fails, or
 * null to proceed. Extracted so `PUT` stays under the cognitive-complexity cap.
 */
async function preflight(
	id: number,
	parsed: GuideTopicUpdate
): Promise<NextResponse | null> {
	if (parsed.slug != null) {
		const owner = await findSlugOwner(parsed.slug, { kind: "topic", id })

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

	if (parsed.projectSlug !== undefined) {
		const refProblem = await describeTopicRefProblem({
			projectSlug: parsed.projectSlug,
		})

		if (refProblem != null) {
			// eslint-disable-next-line no-console
			console.warn(`${PUT_TAG} invalid references`, { id })

			return NextResponse.json({ error: refProblem }, { status: 400 })
		}
	}

	return null
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const unauthorized = await requireAdmin(PUT_TAG)

	if (unauthorized) {
		return unauthorized
	}

	const idResult = await parseIdParam(params)

	if (idResult instanceof NextResponse) {
		return idResult
	}

	const { id } = idResult
	const parsed = await parseJsonBody(request, guideTopicUpdateSchema, PUT_TAG)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	try {
		const problem = await preflight(id, parsed)

		if (problem != null) {
			return problem
		}

		const result = await prisma.$transaction(async (tx) => {
			const existing = await tx.guideTopic.findUnique({
				where: { id },
				select: { slug: true, projectSlug: true },
			})

			if (existing == null) {
				return null
			}

			const isProjectChanged =
				parsed.projectSlug !== undefined &&
				parsed.projectSlug !== existing.projectSlug

			const topic = await tx.guideTopic.update({ where: { id }, data: parsed })

			// A guide must belong to the same project as its topic — that invariant
			// is enforced on every guide write, so a topic changing project has to
			// carry its guides with it or the rule becomes a lie the moment it's
			// edited here. Cascading matches the intent of the move (the whole
			// cluster changes product); the alternative — refusing the edit while
			// the topic has guides — makes a legitimate operation impossible without
			// unlinking each guide first.
			if (isProjectChanged) {
				await tx.guide.updateMany({
					where: { topicId: id },
					data: { projectSlug: topic.projectSlug },
				})
			}

			const guides = await tx.guide.findMany({
				where: { topicId: id },
				select: { slug: true },
			})

			return {
				topic,
				previousSlug: existing.slug,
				guideSlugs: guides.map((guide) => guide.slug),
				isProjectChanged,
			}
		})

		if (result == null) {
			return NextResponse.json({ error: "Not found" }, { status: 404 })
		}

		const { topic, previousSlug, guideSlugs, isProjectChanged } = result

		if (isProjectChanged) {
			// The cascade rewrote rows the admin didn't name; leave a breadcrumb so
			// "why did these guides move product" is answerable from the logs.
			// eslint-disable-next-line no-console
			console.info(`${PUT_TAG} cascaded projectSlug to guides`, {
				topicSlug: topic.slug,
				projectSlug: topic.projectSlug,
				guideCount: guideSlugs.length,
			})
		}

		// Each guide renders the parent link, which appears/disappears with the
		// topic's publish state and shows its title — so they ride along.
		revalidateGuideTopic(topic.slug, guideSlugs)

		const isRenamed = previousSlug !== topic.slug

		if (isRenamed) {
			// The old hub URL stays cached under its own tag otherwise.
			revalidateGuideTopic(previousSlug)
		}

		auditLog(PUT_TAG, {
			id: topic.id,
			slug: topic.slug,
			section: null,
			sortOrder: null,
			previousSection: null,
			previousSlug: isRenamed ? previousSlug : null,
			batchId: null,
		})

		return NextResponse.json(topic)
	} catch (error) {
		if (isPrismaUniqueConstraint(error)) {
			return NextResponse.json(
				{ error: "A topic with this slug already exists" },
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

const DELETE_TAG = "[api:admin:guide-topics:DELETE]"

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const unauthorized = await requireAdmin(DELETE_TAG)

	if (unauthorized) {
		return unauthorized
	}

	const idResult = await parseIdParam(params)

	if (idResult instanceof NextResponse) {
		return idResult
	}

	const { id } = idResult

	try {
		const deleted = await prisma.guideTopic.delete({ where: { id } })

		revalidateGuideTopic(deleted.slug)

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
		// The relation is `Restrict`, so Postgres refuses to delete a topic that
		// still has guides. That's the designed behaviour — surface it as a 409 the
		// admin can act on, not a 500 that reads like a bug.
		if (isPrismaForeignKeyConstraint(error)) {
			// eslint-disable-next-line no-console
			console.warn(`${DELETE_TAG} topic still has guides`, { id })

			return NextResponse.json(
				{
					error:
						"This topic still has guides. Move or delete them first, or unpublish the topic instead.",
				},
				{ status: 409 }
			)
		}

		const notFound = handlePrismaError(error, DELETE_TAG)

		if (notFound) {
			return notFound
		}

		return respondInternalError(DELETE_TAG, error)
	}
}
