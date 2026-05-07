import { NextResponse } from "next/server"
import { parseJsonBody, respondInternalError } from "@/lib/apiErrors"
import { isPrismaUniqueConstraint, prisma } from "@/lib/db"
import { calculateReadingTime, createSlug } from "@/lib/format"
import { revalidatePostSection } from "@/lib/posts"
import { postCreateSchema } from "@/lib/schemas"

export async function POST(request: Request): Promise<NextResponse> {
	const parsed = await parseJsonBody(
		request,
		postCreateSchema,
		"[api:admin:posts:POST]"
	)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	const {
		title,
		body: postBody,
		datetime,
		summary,
		imageUrl,
		section,
		published,
	} = parsed

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

		return respondInternalError("[api:admin:posts:POST]", error)
	}
}
