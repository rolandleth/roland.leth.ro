import GuideTopicForm from "@/components/admin/GuideTopicForm"
import { ADMIN_NEW_TAGS } from "@/lib/auth/adminTags"
import { requireAdminPageSession } from "@/lib/auth/middlewareBypass"
import { getProjectsForAdmin } from "@/lib/db/projects"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "New topic",
}

export default async function NewGuideTopicPage() {
	// The layout's session check doesn't re-run on a client-side nav within
	// `(protected)/` — see `requireAdminPageSession` for why this page needs
	// its own, ahead of reading the project list below.
	await requireAdminPageSession(ADMIN_NEW_TAGS.guideTopics)

	const projects = await getProjectsForAdmin()

	return <GuideTopicForm projects={projects} />
}
