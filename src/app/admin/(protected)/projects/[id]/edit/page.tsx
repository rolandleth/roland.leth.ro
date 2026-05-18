import { notFound } from "next/navigation"
import ProjectForm from "@/components/admin/ProjectForm"
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
	const projectId = parseIntId(id)

	if (projectId === null) {
		return { title: "Edit project" }
	}

	const project = await loadProjectForAdmin(projectId)

	return { title: project ? `Edit: ${project.name}` : "Edit project" }
}

export default async function EditProjectPage({ params }: PageProps) {
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
