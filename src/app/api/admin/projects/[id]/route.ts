import { NextResponse } from "next/server"
import { isPrismaNotFound, prisma } from "@/lib/db"
import { createSlug, parseIntId } from "@/lib/format"
import { projectUpdateSchema } from "@/lib/schemas"

type SectionInput = {
	title: string
	description: string
	sortOrder?: number
	images?: { url: string; caption?: string | null; sortOrder?: number }[]
}

type LinkInput = {
	label: string
	url: string
	sortOrder?: number
}

function toSectionCreate(sections: SectionInput[] | undefined) {
	if (sections == null) {
		return undefined
	}

	return {
		create: sections.map((s) => ({
			title: s.title,
			description: s.description,
			sortOrder: s.sortOrder ?? 0,
			images: s.images
				? {
						create: s.images.map((img) => ({
							url: img.url,
							caption: img.caption ?? null,
							sortOrder: img.sortOrder ?? 0,
						})),
					}
				: undefined,
		})),
	}
}

function toLinkCreate(links: LinkInput[] | undefined) {
	if (links == null) {
		return undefined
	}

	return {
		create: links.map((l) => ({
			label: l.label,
			url: l.url,
			sortOrder: l.sortOrder ?? 0,
		})),
	}
}

const projectInclude = {
	sections: {
		orderBy: { sortOrder: "asc" as const },
		include: { images: { orderBy: { sortOrder: "asc" as const } } },
	},
	links: { orderBy: { sortOrder: "asc" as const } },
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const { id } = await params
	const projectId = parseIntId(id)

	if (projectId === null) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 })
	}

	const project = await prisma.project.findUnique({
		where: { id: projectId },
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
	const { id } = await params
	const numericId = parseIntId(id)

	if (numericId === null) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 })
	}

	const parsed = projectUpdateSchema.safeParse(await request.json())

	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
	}

	const { name, sections, links, ...rest } = parsed.data
	const data: Record<string, unknown> = Object.fromEntries(
		Object.entries(rest).filter(([, v]) => v != null)
	)

	if (name != null) {
		data.name = name
		data.slug = createSlug(name)
	}

	try {
		const project = await prisma.$transaction(async (tx) => {
			if (data.sortOrder != null) {
				const current = await tx.project.findUnique({
					where: { id: numericId },
					select: { sortOrder: true },
				})

				if (current != null && current.sortOrder !== data.sortOrder) {
					const oldOrder = current.sortOrder
					const newOrder = data.sortOrder as number

					if (newOrder < oldOrder) {
						// Moving up: shift the range [new, old) down to make room.
						await tx.project.updateMany({
							where: {
								id: { not: numericId },
								sortOrder: { gte: newOrder, lt: oldOrder },
							},
							data: { sortOrder: { increment: 1 } },
						})
					} else {
						// Moving down: shift the range (old, new] up to fill the gap.
						await tx.project.updateMany({
							where: {
								id: { not: numericId },
								sortOrder: { gt: oldOrder, lte: newOrder },
							},
							data: { sortOrder: { decrement: 1 } },
						})
					}
				}
			}

			if (sections != null) {
				// Delete all existing sections (cascade removes images).
				await tx.projectSection.deleteMany({ where: { projectId: numericId } })
			}

			if (links != null) {
				await tx.projectLink.deleteMany({ where: { projectId: numericId } })
			}

			return tx.project.update({
				where: { id: numericId },
				data: {
					...data,
					sections: toSectionCreate(sections),
					links: toLinkCreate(links),
				},
				include: projectInclude,
			})
		})

		return NextResponse.json(project)
	} catch (error) {
		if (isPrismaNotFound(error)) {
			return NextResponse.json({ error: "Not found" }, { status: 404 })
		}

		// eslint-disable-next-line no-console
		console.error(error)

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		)
	}
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<Response> {
	const { id } = await params
	const projectId = parseIntId(id)

	if (projectId === null) {
		return new Response(JSON.stringify({ error: "Invalid id" }), {
			status: 400,
		})
	}

	try {
		await prisma.$transaction(async (tx) => {
			const deleted = await tx.project.delete({ where: { id: projectId } })

			// Close the gap left by the deleted project.
			await tx.project.updateMany({
				where: { sortOrder: { gt: deleted.sortOrder } },
				data: { sortOrder: { decrement: 1 } },
			})
		})
	} catch (error) {
		if (isPrismaNotFound(error)) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
			})
		}

		// eslint-disable-next-line no-console
		console.error(error)

		return new Response(JSON.stringify({ error: "Internal server error" }), {
			status: 500,
		})
	}

	return new Response(null, { status: 204 })
}
