import { notFound } from "next/navigation"
import GuideForm from "@/components/admin/GuideForm"
import { listGuideTopicOptions, loadGuideForAdmin } from "@/lib/db/guides"
import { getProjectsForAdmin } from "@/lib/db/projects"
import { parseIntId } from "@/lib/utils/format"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params
	const guideId = parseIntId(id)

	if (guideId === null) {
		return { title: "Edit guide" }
	}

	const guide = await loadGuideForAdmin(guideId)

	return { title: guide ? `Edit: ${guide.title}` : "Edit guide" }
}

export default async function EditGuidePage({ params }: Props) {
	const { id } = await params
	const guideId = parseIntId(id)

	if (guideId === null) {
		notFound()
	}

	// `loadGuideForAdmin` is React-cached, so this shares the fetch with
	// `generateMetadata` above.
	const [guide, topics, projects] = await Promise.all([
		loadGuideForAdmin(guideId),
		listGuideTopicOptions(),
		getProjectsForAdmin(),
	])

	if (!guide) {
		notFound()
	}

	return <GuideForm initialData={guide} topics={topics} projects={projects} />
}
