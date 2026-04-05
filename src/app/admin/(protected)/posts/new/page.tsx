import PostForm from "@/components/admin/PostForm"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "New post",
}

export default function NewPostPage() {
	return <PostForm />
}
