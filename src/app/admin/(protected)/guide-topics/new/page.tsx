import GuideTopicForm from "@/components/admin/GuideTopicForm"
import { getProjectsForAdmin } from "@/lib/db/projects"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "New topic",
}

export default async function NewGuideTopicPage() {
	const projects = await getProjectsForAdmin()

	return <GuideTopicForm projects={projects} />
}
