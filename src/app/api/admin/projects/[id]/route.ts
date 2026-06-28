import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import {
	handlePrismaError,
	parseIdParam,
	parseJsonBody,
	respondInternalError,
} from "@/lib/api/apiErrors"
import { auditLog } from "@/lib/api/auditLog"
import { projectUpdateSchema } from "@/lib/api/schemas"
import { prisma } from "@/lib/db/db"
import {
	projectInclude,
	revalidateProject,
	toFaqCreate,
	toLinkCreate,
	toSectionCreate,
} from "@/lib/db/projects"
import { createSlug } from "@/lib/utils/format"

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

	const { name, sections, links, faqs, ...rest } = parsed
	// `rest` carries the Zod-inferred field types; Prisma treats `undefined`
	// as "skip this column" and `null` as "set to null" natively, so we don't
	// need to strip undefineds. `name` is folded in alongside a derived `slug`.
	type ProjectUpdatePayload = typeof rest & { name?: string; slug?: string }
	const data: ProjectUpdatePayload = { ...rest }

	if (name != null) {
		data.name = name
		data.slug = createSlug(name)
	}

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
		const { project, previousSlug } = await prisma.$transaction(
			async (tx) => {
				// Read the current slug inside the txn so a name-change rename
				// atomically learns the old slug — otherwise two concurrent
				// renames could both see the same `previousSlug` and skip one
				// of the per-slug tag busts. Only read when `name` is being
				// updated; an unrelated PUT doesn't need to know the old slug.
				const previousSlug =
					name != null
						? ((
								await tx.project.findUnique({
									where: { id },
									select: { slug: true },
								})
							)?.slug ?? null)
						: null

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

				const project = await tx.project.update({
					where: { id },
					data: {
						...data,
						sections: toSectionCreate(sections),
						links: toLinkCreate(links),
						faqs: toFaqCreate(faqs),
					},
					include: projectInclude,
				})

				return { project, previousSlug }
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
		)

		revalidateProject(project.slug)

		// `previousSlug` semantically means "the slug renamed, here's what it
		// was", not "name was edited" — a no-op rename whose normalized slug
		// stays identical doesn't surface (matches the posts PUT contract).
		// Single source so the revalidate gate and the audit payload can't
		// drift apart.
		const isRenamed = previousSlug != null && previousSlug !== project.slug

		if (isRenamed) {
			revalidateProject(previousSlug)
		}
		auditLog("[api:admin:projects:PUT]", {
			id: project.id,
			slug: project.slug,
			section: null,
			sortOrder: project.sortOrder,
			previousSection: null,
			previousSlug: isRenamed ? previousSlug : null,
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
	const idResult = await parseIdParam(params)

	if (idResult instanceof NextResponse) {
		return idResult
	}

	const { id } = idResult

	try {
		// Serializable isolation for the same reason as the PUT handler: a concurrent
		// sortOrder write during a delete could leave duplicate slots after the
		// decrement-shift below.
		const deleted = await prisma.$transaction(
			async (tx) => {
				const project = await tx.project.delete({ where: { id } })

				// Close the gap left by the deleted project.
				await tx.project.updateMany({
					where: { sortOrder: { gt: project.sortOrder } },
					data: { sortOrder: { decrement: 1 } },
				})

				return project
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
		)

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
