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
	// `generateMetadata`'s `adminEditMetadata` only guards the `<title>` — it
	// logs and falls back but does not stop this body from rendering, since
	// Next calls the two independently. See `requireAdminPageSession` for why
	// this body needs its own check ahead of reading the row below.
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
