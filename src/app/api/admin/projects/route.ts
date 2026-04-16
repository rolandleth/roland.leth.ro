import { revalidateTag } from "next/cache"
import { NextResponse } from "next/server"
import { isPrismaUniqueConstraint, prisma } from "@/lib/db"
import { createSlug } from "@/lib/format"
import { projectInclude, toLinkCreate, toSectionCreate } from "@/lib/projects"
import { projectCreateSchema } from "@/lib/schemas"

export async function GET(): Promise<NextResponse> {
	const projects = await prisma.project.findMany({
		orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
	})

	return NextResponse.json(projects)
}

export async function POST(request: Request): Promise<NextResponse> {
	const parsed = projectCreateSchema.safeParse(await request.json())

	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
	}

	const {
		name,
		summary,
		platform,
		role,
		accentColor,
		icon,
		heroImage,
		isFeatured,
		isDiscontinued,
		date,
		sortOrder,
		sections,
		links,
	} = parsed.data

	try {
		const project = await prisma.$transaction(async (tx) => {
			let targetOrder: number

			if (sortOrder != null) {
				// Shift everything at or after the target position down to make room.
				await tx.project.updateMany({
					where: { sortOrder: { gte: sortOrder } },
					data: { sortOrder: { increment: 1 } },
				})
				targetOrder = sortOrder
			} else {
				// No position given — append after the last project.
				const count = await tx.project.count()
				targetOrder = count + 1
			}

			return tx.project.create({
				data: {
					name,
					slug: createSlug(name),
					summary,
					platform,
					role: role ?? null,
					accentColor: accentColor ?? null,
					icon: icon ?? null,
					heroImage: heroImage ?? null,
					isFeatured: isFeatured ?? false,
					isDiscontinued: isDiscontinued ?? false,
					date: date ?? null,
					sortOrder: targetOrder,
					sections: toSectionCreate(sections),
					links: toLinkCreate(links),
				},
				include: projectInclude,
			})
		})

		revalidateTag("projects", "max")
		revalidateTag(`project-${project.slug}`, "max")

		return NextResponse.json(project, { status: 201 })
	} catch (error) {
		if (isPrismaUniqueConstraint(error)) {
			return NextResponse.json(
				{ error: "A project with this slug already exists" },
				{ status: 409 }
			)
		}

		// eslint-disable-next-line no-console
		console.error(error)

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		)
	}
}
