import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import {
	handlePrismaError,
	parseIdParam,
	parseJsonBody,
	respondInternalError,
} from "@/lib/apiErrors"
import { prisma } from "@/lib/db"
import { createSlug } from "@/lib/format"
import {
	projectInclude,
	revalidateProject,
	toLinkCreate,
	toSectionCreate,
} from "@/lib/projects"
import { projectUpdateSchema } from "@/lib/schemas"

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

	const { name, sections, links, ...rest } = parsed
	// `rest` carries the Zod-inferred field types; Prisma treats `undefined`
	// as "skip this column" and `null` as "set to null" natively, so we don't
	// need to strip undefineds. `name` is folded in alongside a derived `slug`.
	type ProjectUpdatePayload = typeof rest & { name?: string; slug?: string }
	const data: ProjectUpdatePayload = { ...rest }

	if (name != null) {
		data.name = name
		data.slug = createSlug(name)
	}

	// Read the current slug before the update so a name change (which derives a
	// new slug) can also invalidate the old per-slug cache tag. Without this,
	// the old slug tag lingers until its next natural revalidation.
	const previousSlug =
		name != null
			? ((
					await prisma.project.findUnique({
						where: { id },
						select: { slug: true },
					})
				)?.slug ?? null)
			: null

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

				return tx.project.update({
					where: { id },
					data: {
						...data,
						sections: toSectionCreate(sections),
						links: toLinkCreate(links),
					},
					include: projectInclude,
				})
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
		)

		revalidateProject(project.slug)

		if (previousSlug != null && previousSlug !== project.slug) {
			revalidateProject(previousSlug)
		}

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

		return new NextResponse(null, { status: 204 })
	} catch (error) {
		const notFound = handlePrismaError(error, "[api:admin:projects:DELETE]")

		if (notFound) {
			return notFound
		}

		return respondInternalError("[api:admin:projects:DELETE]", error)
	}
}
