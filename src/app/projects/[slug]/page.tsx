import { notFound } from "next/navigation"
import ProjectContent from "@/components/projects/ProjectContent"
import { markdownToReact } from "@/lib/markdown"
import { getProjectBySlug } from "@/lib/projects"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params
	const project = await getProjectBySlug(slug)

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
	const project = await getProjectBySlug(slug)

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
