import { notFound } from "next/navigation"
import PostForm from "@/components/admin/PostForm"
import { loadPostForAdmin } from "@/lib/db/posts"
import { parseIntId } from "@/lib/utils/format"
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

	const post = await loadPostForAdmin(postId)

	return { title: post ? `Edit: ${post.title}` : "Edit post" }
}

export default async function EditPostPage({ params }: Props) {
	const { id } = await params
	const postId = parseIntId(id)

	if (postId === null) {
		notFound()
	}

	const post = await loadPostForAdmin(postId)

	if (!post) {
		notFound()
	}

	return <PostForm initialData={post} />
}
