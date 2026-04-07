import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
	const { slug } = await params
	const base = new URL(request.url).origin

	const post = await prisma.post.findFirst({
		where: { slug },
		select: { section: true, slug: true },
	})

	if (post) {
		return NextResponse.redirect(
			new URL(`/blog/${post.section}/${post.slug}`, base),
			301
		)
	}

	const project = await prisma.project.findFirst({
		where: { slug },
		select: { slug: true },
	})

	if (project) {
		return NextResponse.redirect(
			new URL(`/projects/${project.slug}`, base),
			301
		)
	}

	return NextResponse.json({ error: "Not found" }, { status: 404 })
}
