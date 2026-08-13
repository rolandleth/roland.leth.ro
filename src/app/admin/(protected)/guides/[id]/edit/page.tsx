import { notFound } from "next/navigation"
import GuideForm from "@/components/admin/GuideForm"
import { adminEditMetadata } from "@/lib/auth/adminMetadata"
import { listGuideTopicOptions, loadGuideForAdmin } from "@/lib/db/guides"
import { getProjectsForAdmin } from "@/lib/db/projects"
import { parseIntId } from "@/lib/utils/format"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params

	return adminEditMetadata(
		"[admin:guides:edit]",
		id,
		"Edit guide",
		async (guideId) => {
			const guide = await loadGuideForAdmin(guideId)

			return guide?.title ?? null
		}
	)
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
