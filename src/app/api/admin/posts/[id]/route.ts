import { NextResponse } from "next/server"
import { handlePrismaError, parseIdParam } from "@/lib/apiErrors"
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

	const post = await prisma.post.findUnique({ where: { id } })

	if (!post) {
		return NextResponse.json({ error: "Not found" }, { status: 404 })
	}

	return NextResponse.json(post)
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

	const parsed = postUpdateSchema.safeParse(await request.json())

	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
	}

	const { title, body: postBody, ...rest } = parsed.data
	// `v !== undefined` (not `!= null`) so explicit `null` clears are preserved.
	const data: Record<string, unknown> = Object.fromEntries(
		Object.entries(rest).filter(([, v]) => v !== undefined)
	)

	if (title != null) {
		data.title = title
		data.slug = createSlug(title)
	}

	if (postBody != null) {
		data.body = postBody
		data.readingTime = calculateReadingTime(postBody)
	}

	try {
		const post = await prisma.post.update({
			where: { id },
			data,
		})

		revalidatePostSection(post.section)

		return NextResponse.json(post)
	} catch (error) {
		const notFound = handlePrismaError(error)

		if (notFound) {
			return notFound
		}

		// eslint-disable-next-line no-console
		console.error("[api:admin:posts:PUT]", error)

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
		const post = await prisma.post.delete({
			where: { id },
			select: { section: true },
		})

		revalidatePostSection(post.section)

		return new NextResponse(null, { status: 204 })
	} catch (error) {
		const notFound = handlePrismaError(error)

		if (notFound) {
			return notFound
		}

		// eslint-disable-next-line no-console
		console.error("[api:admin:posts:DELETE]", error)

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		)
	}
}
