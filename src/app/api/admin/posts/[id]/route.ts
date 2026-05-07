import { NextResponse } from "next/server"
import {
	handlePrismaError,
	parseIdParam,
	parseJsonBody,
	respondInternalError,
} from "@/lib/apiErrors"
import { prisma } from "@/lib/db"
import { calculateReadingTime, createSlug } from "@/lib/format"
import { revalidatePostSection } from "@/lib/posts"
import { postUpdateSchema } from "@/lib/schemas"

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
		const post = await prisma.post.findUnique({ where: { id } })

		if (!post) {
			return NextResponse.json({ error: "Not found" }, { status: 404 })
		}

		return NextResponse.json(post)
	} catch (error) {
		return respondInternalError("[api:admin:posts:GET]", error)
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
		postUpdateSchema,
		"[api:admin:posts:PUT]"
	)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	const { title, body: postBody, ...rest } = parsed
	// Prisma treats `undefined` as "skip this column" and `null` as "set null",
	// so the validated payload flows straight in. `title`/`body` are folded back
	// with their derived columns (`slug`, `readingTime`) only when they were set.
	// Matches the shape in `src/app/api/admin/projects/[id]/route.ts`.
	type PostUpdatePayload = typeof rest & {
		title?: string
		slug?: string
		body?: string
		readingTime?: string
	}
	const data: PostUpdatePayload = { ...rest }

	if (title != null) {
		data.title = title
		data.slug = createSlug(title)
	}

	if (postBody != null) {
		data.body = postBody
		data.readingTime = calculateReadingTime(postBody)
	}

	try {
		// Read the previous section before the update so a cross-section move
		// (e.g. tech → life) can invalidate the old section's caches too —
		// otherwise the post would linger in the old section's archive/feed
		// until the next 5-minute revalidate. The two statements are not in a
		// transaction: if a concurrent PUT runs between the read and the update,
		// both writers bust their own new section and the old-section bust from
		// this read may be stale. Acceptable: worst case is a 5-minute cache lag,
		// not a data-integrity issue.
		const previous = await prisma.post.findUnique({
			where: { id },
			select: { section: true },
		})

		const post = await prisma.post.update({
			where: { id },
			data,
		})

		revalidatePostSection(post.section)

		if (previous != null && previous.section !== post.section) {
			revalidatePostSection(previous.section)
		}

		return NextResponse.json(post)
	} catch (error) {
		const notFound = handlePrismaError(error, "[api:admin:posts:PUT]")

		if (notFound) {
			return notFound
		}

		return respondInternalError("[api:admin:posts:PUT]", error)
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
		const post = await prisma.post.delete({
			where: { id },
			select: { section: true },
		})

		revalidatePostSection(post.section)

		return new NextResponse(null, { status: 204 })
	} catch (error) {
		const notFound = handlePrismaError(error, "[api:admin:posts:DELETE]")

		if (notFound) {
			return notFound
		}

		return respondInternalError("[api:admin:posts:DELETE]", error)
	}
}
