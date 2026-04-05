import { NextResponse } from "next/server"
import { isPrismaNotFound, prisma } from "@/lib/db"
import { calculateReadingTime, createSlug, parseIntId } from "@/lib/format"
import { postUpdateSchema } from "@/lib/schemas"

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const { id } = await params
	const postId = parseIntId(id)

	if (postId === null) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 })
	}

	const post = await prisma.post.findUnique({ where: { id: postId } })

	if (!post) {
		return NextResponse.json({ error: "Not found" }, { status: 404 })
	}

	return NextResponse.json(post)
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const { id } = await params
	const postId = parseIntId(id)

	if (postId === null) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 })
	}

	const parsed = postUpdateSchema.safeParse(await request.json())

	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
	}

	const { title, body: postBody, ...rest } = parsed.data
	const data: Record<string, unknown> = Object.fromEntries(
		Object.entries(rest).filter(([, v]) => v != null)
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
			where: { id: postId },
			data,
		})

		return NextResponse.json(post)
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
	const postId = parseIntId(id)

	if (postId === null) {
		return new Response(JSON.stringify({ error: "Invalid id" }), {
			status: 400,
		})
	}

	try {
		await prisma.post.delete({ where: { id: postId } })
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
