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
	// `generateMetadata`'s `adminEditMetadata` only guards the `<title>` — it
	// logs and falls back but does not stop this body from rendering, since
	// Next calls the two independently. See `requireAdminPageSession` for why
	// this body needs its own check ahead of reading the row below.
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
