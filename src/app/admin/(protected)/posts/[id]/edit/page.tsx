import { notFound } from "next/navigation"
import PostForm from "@/components/admin/PostForm"
import { ADMIN_EDIT_TAGS, adminEditMetadata } from "@/lib/auth/adminMetadata"
import { requireAdminPageSession } from "@/lib/auth/middlewareBypass"
import { loadPostForAdmin } from "@/lib/db/posts"
import { parseIntId } from "@/lib/utils/format"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params

	return adminEditMetadata({
		tag: ADMIN_EDIT_TAGS.posts,
		id,
		fallback: "Edit post",
		loadName: async (postId) => {
			const post = await loadPostForAdmin(postId)

			return post?.title ?? null
		},
	})
}

export default async function EditPostPage({ params }: Props) {
	// Required even though `generateMetadata` above is guarded; see
	// `requireAdminPageSession` for why the two don't substitute.
	await requireAdminPageSession(ADMIN_EDIT_TAGS.posts)

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
