import { revalidateTag } from "next/cache"
import { NextResponse } from "next/server"
import { handlePrismaError, parseIdParam } from "@/lib/apiErrors"
import { prisma } from "@/lib/db"
import { createSlug } from "@/lib/format"
import { projectInclude, toLinkCreate, toSectionCreate } from "@/lib/projects"
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

	const project = await prisma.project.findUnique({
		where: { id },
		include: projectInclude,
	})

	if (!project) {
		return NextResponse.json({ error: "Not found" }, { status: 404 })
	}

	return NextResponse.json(project)
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

	const parsed = projectUpdateSchema.safeParse(await request.json())

	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
	}

	const { name, sections, links, ...rest } = parsed.data
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
		// The sortOrder shift below assumes a single concurrent writer: it reads
		// the current position, then updates the affected range. Prisma's default
		// READ COMMITTED isolation plus the absence of a `@@unique` constraint on
		// `Project.sortOrder` means two simultaneous PUTs could compute disjoint
		// shift ranges and produce duplicate sortOrder values with no error.
		// Fine on a single-admin site; escalate to `Prisma.TransactionIsolationLevel.Serializable`
		// (or add the unique constraint) the moment a second editor is added.
		const project = await prisma.$transaction(async (tx) => {
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
		})

		revalidateTag("projects", "max")
		revalidateTag(`project-${project.slug}`, "max")

		return NextResponse.json(project)
	} catch (error) {
		const notFound = handlePrismaError(error)

		if (notFound) {
			return notFound
		}

		// eslint-disable-next-line no-console
		console.error("[api:admin:projects:PUT]", error)

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		)
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
		const deleted = await prisma.$transaction(async (tx) => {
			const project = await tx.project.delete({ where: { id } })

			// Close the gap left by the deleted project.
			await tx.project.updateMany({
				where: { sortOrder: { gt: project.sortOrder } },
				data: { sortOrder: { decrement: 1 } },
			})

			return project
		})

		revalidateTag("projects", "max")
		revalidateTag(`project-${deleted.slug}`, "max")

		return new NextResponse(null, { status: 204 })
	} catch (error) {
		const notFound = handlePrismaError(error)

		if (notFound) {
			return notFound
		}

		// eslint-disable-next-line no-console
		console.error("[api:admin:projects:DELETE]", error)

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		)
	}
}
