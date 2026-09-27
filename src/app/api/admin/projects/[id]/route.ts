import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import {
	handlePrismaError,
	parseIdParam,
	parseJsonBody,
	respondInternalError,
} from "@/lib/api/apiErrors"
import { auditLog } from "@/lib/api/auditLog"
import { requireAdmin } from "@/lib/api/requireAdmin"
import { projectUpdateSchema } from "@/lib/api/schemas"
import { prisma } from "@/lib/db/db"
import {
	projectInclude,
	revalidateProject,
	toFaqCreate,
	toLinkCreate,
	toSectionCreate,
} from "@/lib/db/projects"

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const unauthorized = await requireAdmin("[api:admin:projects:GET]")

	if (unauthorized) {
		return unauthorized
	}

	const idResult = await parseIdParam(params)

	if (idResult instanceof NextResponse) {
		return idResult
	}

	const { id } = idResult

	try {
		const project = await prisma.project.findUnique({
			where: { id },
			include: projectInclude,
		})

		if (!project) {
			return NextResponse.json({ error: "Not found" }, { status: 404 })
		}

		return NextResponse.json(project)
	} catch (error) {
		return respondInternalError("[api:admin:projects:GET]", error)
	}
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const unauthorized = await requireAdmin("[api:admin:projects:PUT]")

	if (unauthorized) {
		return unauthorized
	}

	const idResult = await parseIdParam(params)

	if (idResult instanceof NextResponse) {
		return idResult
	}

	const { id } = idResult

	const parsed = await parseJsonBody(
		request,
		projectUpdateSchema,
		"[api:admin:projects:PUT]"
	)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	// `data` carries the Zod-inferred field types; Prisma treats `undefined` as
	// "skip this column" and `null` as "set to null" natively, so we don't need
	// to strip undefineds. It never carries a slug: `projectUpdateSchema` has no
	// such key, so a renamed project keeps its URL and its guide references.
	const { sections, links, faqs, ...data } = parsed

	try {
		// The sortOrder shift reads the current position, then updates the affected
		// range. Under READ COMMITTED (Prisma/Postgres default), two simultaneous
		// PUTs could compute disjoint shift ranges and produce duplicate sortOrder
		// values with no error — Postgres can't enforce uniqueness here because
		// `Project.sortOrder` has no `@@unique` constraint (a reorder would need
		// `DEFERRABLE INITIALLY DEFERRED`, unexpressible in Prisma DSL). Running
		// the transaction at `Serializable` isolation is the cheap cover: Postgres
		// aborts one of the conflicting txns with a serialization_failure instead
		// of letting both commit. At single-admin volumes conflicts are essentially
		// impossible, so no retry loop.
		const project = await prisma.$transaction(
			async (tx) => {
				if (data.sortOrder != null) {
					const current = await tx.project.findUnique({
						where: { id },
						select: { sortOrder: true },
					})

					if (current != null && current.sortOrder !== data.sortOrder) {
						const oldOrder = current.sortOrder
						const newOrder = data.sortOrder

						if (newOrder < oldOrder) {
							// Moving up: shift the range [new, old) down to make room.
							await tx.project.updateMany({
								where: {
									id: { not: id },
									sortOrder: { gte: newOrder, lt: oldOrder },
								},
								data: { sortOrder: { increment: 1 } },
							})
						} else {
							// Moving down: shift the range (old, new] up to fill the gap.
							await tx.project.updateMany({
								where: {
									id: { not: id },
									sortOrder: { gt: oldOrder, lte: newOrder },
								},
								data: { sortOrder: { decrement: 1 } },
							})
						}
					}
				}

				if (sections != null) {
					// Delete all existing sections (cascade removes images).
					await tx.projectSection.deleteMany({ where: { projectId: id } })
				}

				if (links != null) {
					await tx.projectLink.deleteMany({ where: { projectId: id } })
				}

				if (faqs != null) {
					await tx.projectFaq.deleteMany({ where: { projectId: id } })
				}

				return tx.project.update({
					where: { id },
					data: {
						...data,
						sections: toSectionCreate(sections),
						links: toLinkCreate(links),
						faqs: toFaqCreate(faqs),
					},
					include: projectInclude,
				})
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
		)

		revalidateProject(project.slug)
		auditLog("[api:admin:projects:PUT]", {
			id: project.id,
			slug: project.slug,
			section: null,
			sortOrder: project.sortOrder,
			previousSection: null,
			previousSlug: null,
			batchId: null,
		})

		return NextResponse.json(project)
	} catch (error) {
		const notFound = handlePrismaError(error, "[api:admin:projects:PUT]")

		if (notFound) {
			return notFound
		}

		return respondInternalError("[api:admin:projects:PUT]", error)
	}
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const unauthorized = await requireAdmin("[api:admin:projects:DELETE]")

	if (unauthorized) {
		return unauthorized
	}

	const idResult = await parseIdParam(params)

	if (idResult instanceof NextResponse) {
		return idResult
	}

	const { id } = idResult

	try {
		// Serializable isolation for the same reason as the PUT handler: a concurrent
		// sortOrder write during a delete could leave duplicate slots after the
		// decrement-shift below.
		//
		// simplified: the reference count is a point-in-time check, not a lock.
		// The guide and topic writes validate `projectSlug` in `guideValidation.ts`
		// outside any transaction, and Postgres only detects conflicts between two
		// serializable transactions, so a guide saved against this project while
		// the delete runs can still commit with a dangling `projectSlug`. Accepted
		// for a single admin; closing it means running those reference checks and
		// writes inside serializable transactions too.
		const outcome = await prisma.$transaction(
			async (tx) => {
				const references = await countProjectReferences(tx, id)

				if (references != null && references.total > 0) {
					return { isDeleted: false as const, references }
				}

				const project = await tx.project.delete({ where: { id } })

				// Close the gap left by the deleted project.
				await tx.project.updateMany({
					where: { sortOrder: { gt: project.sortOrder } },
					data: { sortOrder: { decrement: 1 } },
				})

				return { isDeleted: true as const, project }
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
		)

		if (!outcome.isDeleted) {
			const { guides, topics } = outcome.references
			// eslint-disable-next-line no-console
			console.warn("[api:admin:projects:DELETE] project still referenced", {
				id,
				guides,
				topics,
			})

			return NextResponse.json(
				{ error: projectStillReferencedMessage(guides, topics) },
				{ status: 409 }
			)
		}

		const deleted = outcome.project
		revalidateProject(deleted.slug)
		// Audit trail — deletions are the highest-stakes admin write.
		auditLog("[api:admin:projects:DELETE]", {
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
		const notFound = handlePrismaError(error, "[api:admin:projects:DELETE]")

		if (notFound) {
			return notFound
		}

		return respondInternalError("[api:admin:projects:DELETE]", error)
	}
}

type ProjectReferences = { guides: number; topics: number; total: number }

/**
 * Counts the guides and topics that name the project by slug. `null` when the
 * project doesn't exist, so the delete that follows raises the not-found error
 * the route already maps to a 404.
 *
 * Guides and topics reference a project by slug with no foreign key (see
 * `schema.prisma`), so Postgres can't refuse this delete the way it refuses a
 * topic that still has guides. Without the check, those guides would drop off
 * the project page and every later save of one would fail "Unknown project".
 */
async function countProjectReferences(
	tx: Prisma.TransactionClient,
	id: number
): Promise<ProjectReferences | null> {
	const project = await tx.project.findUnique({
		where: { id },
		select: { slug: true },
	})

	if (project == null) {
		return null
	}

	const [guides, topics] = await Promise.all([
		tx.guide.count({ where: { projectSlug: project.slug } }),
		tx.guideTopic.count({ where: { projectSlug: project.slug } }),
	])

	return { guides, topics, total: guides + topics }
}

function projectStillReferencedMessage(guides: number, topics: number): string {
	const parts = [
		guides > 0 ? `${guides} ${guides === 1 ? "guide" : "guides"}` : null,
		topics > 0 ? `${topics} ${topics === 1 ? "topic" : "topics"}` : null,
	].filter((part) => part != null)

	return `This project still has ${parts.join(" and ")}. Move them to another project or clear their project first.`
}
