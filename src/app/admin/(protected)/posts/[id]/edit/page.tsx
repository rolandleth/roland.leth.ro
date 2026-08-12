import { notFound } from "next/navigation"
import PostForm from "@/components/admin/PostForm"
import { adminEditMetadata } from "@/lib/auth/adminMetadata"
import { loadPostForAdmin } from "@/lib/db/posts"
import { parseIntId } from "@/lib/utils/format"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params

	return adminEditMetadata(id, "Edit post", async (postId) => {
		const post = await loadPostForAdmin(postId)

		return post?.title ?? null
	})
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
