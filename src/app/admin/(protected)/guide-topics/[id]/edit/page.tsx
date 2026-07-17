import { notFound } from "next/navigation"
import GuideTopicForm from "@/components/admin/GuideTopicForm"
import { prisma } from "@/lib/db/db"
import { loadGuideTopicForAdmin } from "@/lib/db/guides"
import { getProjectsForAdmin } from "@/lib/db/projects"
import { parseIntId } from "@/lib/utils/format"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params
	const topicId = parseIntId(id)

	if (topicId === null) {
		return { title: "Edit topic" }
	}

	const topic = await loadGuideTopicForAdmin(topicId)

	return { title: topic ? `Edit: ${topic.title}` : "Edit topic" }
}

export default async function EditGuideTopicPage({ params }: Props) {
	const { id } = await params
	const topicId = parseIntId(id)

	if (topicId === null) {
		notFound()
	}

	const [topic, projects, guideCount] = await Promise.all([
		loadGuideTopicForAdmin(topicId),
		getProjectsForAdmin(),
		// Drives both the delete affordance (the FK is `Restrict`, so deleting a
		// topic with guides fails) and the project-change cascade warning.
		prisma.guide.count({ where: { topicId } }),
	])

	if (!topic) {
		notFound()
	}

	return (
		<GuideTopicForm
			initialData={topic}
			projects={projects}
			guideCount={guideCount}
		/>
	)
}
