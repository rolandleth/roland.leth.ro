import { notFound } from "next/navigation"
import ProjectForm from "@/components/admin/ProjectForm"
import { prisma } from "@/lib/db"
import { parseIntId } from "@/lib/format"
import type { Metadata } from "next"

interface PageProps {
	params: Promise<{ id: string }>
}

const projectInclude = {
	sections: {
		orderBy: { sortOrder: "asc" as const },
		include: { images: { orderBy: { sortOrder: "asc" as const } } },
	},
	links: { orderBy: { sortOrder: "asc" as const } },
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { id } = await params
	const projectId = parseIntId(id)

	if (projectId === null) {
		return { title: "Edit project" }
	}

	const project = await prisma.project.findUnique({
		where: { id: projectId },
		select: { name: true },
	})

	return { title: project ? `Edit: ${project.name}` : "Edit project" }
}

export default async function EditProjectPage({ params }: PageProps) {
	const { id } = await params
	const projectId = parseIntId(id)

	if (projectId === null) {
		notFound()
	}

	const project = await prisma.project.findUnique({
		where: { id: projectId },
		include: projectInclude,
	})

	if (!project) {
		notFound()
	}

	const initialData = {
		...project,
		sections: project.sections.map((section) => ({
			...section,
			images: section.images.map((image) => ({
				...image,
				caption: image.caption ?? "",
			})),
		})),
	}

	return <ProjectForm initialData={initialData} />
}
