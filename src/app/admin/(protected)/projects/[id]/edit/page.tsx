import { notFound } from "next/navigation"
import ProjectForm from "@/components/admin/ProjectForm"
import { ADMIN_EDIT_TAGS, adminEditMetadata } from "@/lib/auth/adminMetadata"
import { requireAdminPageSession } from "@/lib/auth/middlewareBypass"
import {
	loadProjectForAdmin,
	toProjectFormInitialData,
} from "@/lib/db/projects"
import { parseIntId } from "@/lib/utils/format"
import type { Metadata } from "next"

interface PageProps {
	params: Promise<{ id: string }>
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { id } = await params

	return adminEditMetadata({
		tag: ADMIN_EDIT_TAGS.projects,
		id,
		fallback: "Edit project",
		loadName: async (projectId) => {
			const project = await loadProjectForAdmin(projectId)

			return project?.name ?? null
		},
	})
}

export default async function EditProjectPage({ params }: PageProps) {
	// Required even though `generateMetadata` above is guarded; see
	// `requireAdminPageSession` for why the two don't substitute.
	await requireAdminPageSession(ADMIN_EDIT_TAGS.projects)

	const { id } = await params
	const projectId = parseIntId(id)

	if (projectId === null) {
		notFound()
	}

	const project = await loadProjectForAdmin(projectId)

	if (!project) {
		notFound()
	}

	return <ProjectForm initialData={toProjectFormInitialData(project)} />
}
