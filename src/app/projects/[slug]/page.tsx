import { notFound } from "next/navigation"
import { cache } from "react"
import ProjectContent from "@/components/projects/ProjectContent"
import { markdownToReact } from "@/lib/markdown"
import { getProjectBySlug } from "@/lib/projects"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ slug: string }>
}

// Deduplicate DB calls between generateMetadata and the page render.
const getCachedProject = cache(getProjectBySlug)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params
	const project = await getCachedProject(slug)

	if (!project) {
		return {}
	}

	return {
		title: project.name,
		description: project.summary,
		openGraph: {
			title: `${project.name} | Roland Leth`,
			description: project.summary,
			url: `/projects/${project.slug}`,
			images: project.heroImage ? [project.heroImage] : undefined,
		},
		twitter: {
			title: project.name,
			description: project.summary,
			images: project.heroImage ? [project.heroImage] : undefined,
		},
	}
}

export default async function ProjectPage({ params }: Props) {
	const { slug } = await params
	const project = await getCachedProject(slug)

	if (!project) {
		notFound()
	}

	const renderedDescriptions = await Promise.all(
		project.sections.map((s) => markdownToReact(s.description))
	)

	return (
		<ProjectContent
			project={project}
			renderedDescriptions={renderedDescriptions}
		/>
	)
}
