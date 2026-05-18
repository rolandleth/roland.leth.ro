import { notFound } from "next/navigation"
import ProjectContent from "@/components/projects/ProjectContent"
import { markdownToReact } from "@/lib/content/markdown"
import { buildPageMetadata } from "@/lib/content/metadata"
import { getAllProjectsForGallery, loadProject } from "@/lib/db/projects"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
	const projects = await getAllProjectsForGallery()

	return projects.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params
	const project = await loadProject(slug)

	if (!project) {
		return {}
	}

	return buildPageMetadata({
		title: project.name,
		description: project.summary,
		path: `/projects/${project.slug}`,
		image: project.heroImage,
	})
}

export default async function ProjectPage({ params }: Props) {
	const { slug } = await params
	const project = await loadProject(slug)

	if (!project) {
		notFound()
	}

	const renderedDescriptions = await Promise.all(
		project.sections.map(async (s) => (
			<div key={s.id}>{await markdownToReact(s.description)}</div>
		))
	)

	return (
		<ProjectContent
			project={project}
			renderedDescriptions={renderedDescriptions}
		/>
	)
}
