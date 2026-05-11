import { NextResponse } from "next/server"
import { parseJsonBody, respondInternalError } from "@/lib/apiErrors"
import { auditLog } from "@/lib/auditLog"
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
		// Audit trail. Vercel Hobby retains runtime logs ~1h, but the structured
		// payload makes it greppable while it's live and is the only signal that
		// answers "did someone create a post at 3am" until external aggregation lands.
		auditLog("[api:admin:posts:POST]", {
			id: post.id,
			slug: post.slug,
			section: post.section,
		})

		return NextResponse.json(post, { status: 201 })
	} catch (error) {
		if (isPrismaUniqueConstraint(error)) {
			// Surfaces a flapping admin form submitting the same draft twice, or
			// an attempt to publish two titles that slug-collide. Without this,
			// the 409 path is invisible in logs.
			// eslint-disable-next-line no-console
			console.warn("[api:admin:posts:POST] slug already exists", {
				slug: createSlug(title),
			})

			return NextResponse.json(
				{ error: "A post with this slug already exists" },
				{ status: 409 }
			)
		}

		return respondInternalError("[api:admin:posts:POST]", error)
	}
}
