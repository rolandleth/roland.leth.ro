import { notFound } from "next/navigation"
import ProjectContent from "@/components/projects/ProjectContent"
import { markdownToReact } from "@/lib/content/markdown"
import { buildPageMetadata } from "@/lib/content/metadata"
import {
	getProjectsGalleryCached,
	loadProject,
	resolveOgImage,
} from "@/lib/db/projects"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
	const projects = await getProjectsGalleryCached()

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
		// Prefer the purpose-built OG asset, then the card image, hero, and first
		// section image (see `resolveOgImage`).
		image: resolveOgImage(project),
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

	// FAQ answers are Markdown too — render them server-side alongside the
	// section descriptions so the accordion client component stays free of the
	// Markdown pipeline. Aligned by index with `project.faqs`.
	const renderedFaqAnswers = await Promise.all(
		project.faqs.map(async (f) => (
			<div key={f.id}>{await markdownToReact(f.answer)}</div>
		))
	)

	return (
		<ProjectContent
			project={project}
			renderedDescriptions={renderedDescriptions}
			renderedFaqAnswers={renderedFaqAnswers}
		/>
	)
}
