import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
	const { slug } = await params

	const post = await prisma.post.findFirst({
		where: { slug },
		select: { section: true, slug: true },
	})

	if (!post) {
		return NextResponse.json({ error: "Not found" }, { status: 404 })
	}

	if (!process.env.NEXTAUTH_URL) {
		return NextResponse.json(
			{ error: "Server misconfiguration" },
			{ status: 500 }
		)
	}

	return NextResponse.redirect(
		new URL(`/blog/${post.section}/${post.slug}`, process.env.NEXTAUTH_URL),
		301
	)
}
