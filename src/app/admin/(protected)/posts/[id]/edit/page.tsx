import { notFound } from "next/navigation"
import PostForm from "@/components/admin/PostForm"
import { prisma } from "@/lib/db"
import { parseIntId } from "@/lib/format"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params
	const postId = parseIntId(id)

	if (postId === null) {
		return { title: "Edit post" }
	}

	const post = await prisma.post.findUnique({
		where: { id: postId },
		select: { title: true },
	})

	return { title: post ? `Edit: ${post.title}` : "Edit post" }
}

export default async function EditPostPage({ params }: Props) {
	const { id } = await params
	const postId = parseIntId(id)

	if (postId === null) {
		notFound()
	}

	const post = await prisma.post.findUnique({ where: { id: postId } })

	if (!post) {
		notFound()
	}

	return <PostForm initialData={post} />
}
