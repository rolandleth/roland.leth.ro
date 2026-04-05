import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { createSlug } from "@/lib/format"
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
		const project = await prisma.project.create({
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
				sortOrder: sortOrder ?? 0,
				sections: sections
					? {
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
					: undefined,
				links: links
					? {
							create: links.map((l) => ({
								label: l.label,
								url: l.url,
								sortOrder: l.sortOrder ?? 0,
							})),
						}
					: undefined,
			},
			include: {
				sections: {
					orderBy: { sortOrder: "asc" },
					include: { images: { orderBy: { sortOrder: "asc" } } },
				},
				links: { orderBy: { sortOrder: "asc" } },
			},
		})

		return NextResponse.json(project, { status: 201 })
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error(error)

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		)
	}
}
