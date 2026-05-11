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
		// Read the previous section in the same transaction as the update so a
		// cross-section move (e.g. tech → life) atomically learns both sides and
		// can invalidate both caches. Without the transaction, two concurrent
		// PUTs could read the same `previous.section`, leaving one side stale.
		// At single-admin volumes this is mostly theoretical; matches the same
		// shape as the project PUT below.
		const { previous, post } = await prisma.$transaction(async (tx) => {
			const previous = await tx.post.findUnique({
				where: { id },
				select: { section: true },
			})

			const post = await tx.post.update({
				where: { id },
				data,
			})

			return { previous, post }
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
