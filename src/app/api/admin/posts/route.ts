import { NextResponse } from "next/server"
import { isPrismaUniqueConstraint, prisma } from "@/lib/db"
import { calculateReadingTime, createSlug } from "@/lib/format"
import { postListItemSelect, revalidatePostSection } from "@/lib/posts"
import { postCreateSchema } from "@/lib/schemas"

export async function GET(): Promise<NextResponse> {
	const posts = await prisma.post.findMany({
		select: postListItemSelect,
		orderBy: { datetime: "desc" },
	})

	return NextResponse.json(posts)
}

export async function POST(request: Request): Promise<NextResponse> {
	const parsed = postCreateSchema.safeParse(await request.json())

	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
	}

	const {
		title,
		body: postBody,
		datetime,
		summary,
		imageUrl,
		section,
		published,
	} = parsed.data

	try {
		const post = await prisma.post.create({
			data: {
				title,
				body: postBody,
				datetime,
				summary: summary ?? null,
				imageUrl: imageUrl ?? null,
				section: section ?? "tech",
				published: published ?? true,
				slug: createSlug(title),
				readingTime: calculateReadingTime(postBody),
			},
		})

		revalidatePostSection(post.section)

		return NextResponse.json(post, { status: 201 })
	} catch (error) {
		if (isPrismaUniqueConstraint(error)) {
			return NextResponse.json(
				{ error: "A post with this slug already exists" },
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
