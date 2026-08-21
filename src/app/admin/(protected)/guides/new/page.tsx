import GuideForm from "@/components/admin/GuideForm"
import { requireAdminPageSession } from "@/lib/auth/middlewareBypass"
import { listGuideTopicOptions } from "@/lib/db/guides"
import { getProjectsForAdmin } from "@/lib/db/projects"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "New guide",
}

export default async function NewGuidePage() {
	// The layout's session check doesn't re-run on a client-side nav within
	// `(protected)/` — see `requireAdminPageSession` for why this page needs
	// its own, ahead of reading the project list below.
	await requireAdminPageSession("[admin:guides:new]")

	const [topics, projects] = await Promise.all([
		listGuideTopicOptions(),
		getProjectsForAdmin(),
	])

	return <GuideForm topics={topics} projects={projects} />
}
