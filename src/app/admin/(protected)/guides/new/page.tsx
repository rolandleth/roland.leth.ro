import GuideForm from "@/components/admin/GuideForm"
import { listGuideTopicOptions } from "@/lib/db/guides"
import { getProjectsForAdmin } from "@/lib/db/projects"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "New guide",
}

export default async function NewGuidePage() {
	const [topics, projects] = await Promise.all([
		listGuideTopicOptions(),
		getProjectsForAdmin(),
	])

	return <GuideForm topics={topics} projects={projects} />
}
