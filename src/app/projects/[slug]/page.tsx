import { notFound } from "next/navigation"
import JsonLdScript from "@/components/JsonLdScript"
import ProjectContent from "@/components/projects/ProjectContent"
import { getSiteUrl } from "@/lib/auth/env"
import { overviewToLinkItems } from "@/lib/content/guideLinks"
import { markdownToReact } from "@/lib/content/markdown"
import { buildPageMetadata } from "@/lib/content/metadata"
import {
	buildFaqJsonLd,
	buildSoftwareApplicationJsonLd,
} from "@/lib/content/projectJsonLd"
import { getGuidesForProject } from "@/lib/db/guides"
import {
	getProjectsGalleryCached,
	loadProject,
	resolveOgImage,
} from "@/lib/db/projects"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ slug: string }>
}

/**
 * Normalizes a rejected-promise reason for structured logging: a real `Error`
 * yields a clean `reason` message plus its `stack` as a separate field, anything
 * else stringifies. Keeps the log legible regardless of how the log pipeline
 * stringifies bare objects.
 */
function describeRenderFailure(reason: unknown): {
	reason: string
	stack?: string
} {
	if (reason instanceof Error) {
		return { reason: reason.message, stack: reason.stack }
	}

	return { reason: String(reason) }
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
		// `metaTitle` drives the `<title>` tag when set (keyword-bearing), falling
		// back to the brand-word `name`. The `<h1>` and gallery card still use `name`.
		title: project.metaTitle ?? project.name,
		description: project.summary,
		path: `/projects/${project.slug}`,
		// Prefer the purpose-built OG asset, then the card image, hero, and first
		// section image (see `resolveOgImage`).
		image: resolveOgImage(project),
		keywords: project.keywords,
	})
}

export default async function ProjectPage({ params }: Props) {
	const { slug } = await params
	const project = await loadProject(slug)

	if (!project) {
		notFound()
	}

	// Section descriptions are Markdown. `allSettled` (like the FAQ block below)
	// so one bad description renders an inline plain-text fallback instead of
	// 500'ing the whole project page. Aligned by index with `project.sections`.
	const descriptionSettlements = await Promise.allSettled(
		project.sections.map(async (s) => markdownToReact(s.description))
	)
	const renderedDescriptions = descriptionSettlements.map((settled, index) => {
		const section = project.sections[index]

		if (settled.status === "fulfilled") {
			return <div key={section.id}>{settled.value}</div>
		}

		// eslint-disable-next-line no-console
		console.error("[ProjectPage] section markdown render failed", {
			projectSlug: project.slug,
			sectionId: section.id,
			...describeRenderFailure(settled.reason),
		})

		return <p key={section.id}>{section.description}</p>
	})

	// FAQ answers are Markdown too — render them server-side alongside the
	// section descriptions so the accordion client component stays free of the
	// Markdown pipeline. Aligned by index with `project.faqs`. `allSettled` so
	// a single bad answer renders an inline fallback instead of 500'ing the
	// whole project page.
	const faqRenderSettlements = await Promise.allSettled(
		project.faqs.map(async (f) => markdownToReact(f.answer))
	)
	const renderedFaqAnswers = faqRenderSettlements.map((settled, index) => {
		const faq = project.faqs[index]

		if (settled.status === "fulfilled") {
			return <div key={faq.id}>{settled.value}</div>
		}

		// Log the underlying parse error so it's visible in server logs while the
		// user still sees a readable page. The plain `<p>` keeps the FAQ content
		// crawlable even when Markdown rendering fails.
		// eslint-disable-next-line no-console
		console.error("[ProjectPage] FAQ markdown render failed", {
			projectSlug: project.slug,
			faqId: faq.id,
			...describeRenderFailure(settled.reason),
		})

		return <p key={faq.id}>{faq.answer}</p>
	})

	// Reads the shared guides aggregate, so this page carries the `guides` cache
	// tag and its section refreshes whenever a guide or topic is edited.
	const guides = overviewToLinkItems(await getGuidesForProject(project.slug))

	const ogImage = resolveOgImage(project)

	// Structured data for search + AI answer engines. Built server-side (not in
	// the client `ProjectContent`) so the JSON-LD is always in the SSR HTML.
	// `buildFaqJsonLd` returns null when there are no FAQs; the SoftwareApplication
	// block only renders for app buckets (iOS/Mac).
	const faqJsonLd = buildFaqJsonLd(project.faqs)
	const softwareJsonLd = buildSoftwareApplicationJsonLd(
		project,
		ogImage,
		getSiteUrl()
	)

	return (
		<>
			<JsonLdScript data={faqJsonLd} />
			<JsonLdScript data={softwareJsonLd} />

			<ProjectContent
				project={project}
				renderedDescriptions={renderedDescriptions}
				renderedFaqAnswers={renderedFaqAnswers}
				guides={guides}
			/>
		</>
	)
}
