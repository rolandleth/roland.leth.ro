import { notFound } from "next/navigation"
import JsonLdScript from "@/components/JsonLdScript"
import ProductPage from "@/components/projects/product/ProductPage"
import ProjectContent from "@/components/projects/ProjectContent"
import { ProjectPageLayout } from "@/generated/prisma/enums"
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
import type { ReactNode } from "react"

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

interface MarkdownRows<Row extends { id: number }> {
	rows: readonly Row[]
	markdownOf: (row: Row) => string
	/** Names the rows in the failure log, e.g. "section" or "FAQ". */
	label: string
	/** The log field that carries the failed row's id, e.g. "sectionId". */
	idField: string
	projectSlug: string
}

/**
 * Renders each row's markdown, aligned by index with `rows`. `allSettled`, so
 * one bad body renders as plain text instead of 500'ing the whole project page:
 * still readable, still crawlable. The failure goes to the server log with the
 * row's id, so it's visible while the reader still gets the page.
 */
async function renderMarkdownRows<Row extends { id: number }>({
	rows,
	markdownOf,
	label,
	idField,
	projectSlug,
}: MarkdownRows<Row>): Promise<ReactNode[]> {
	const settlements = await Promise.allSettled(
		rows.map(async (row) => markdownToReact(markdownOf(row)))
	)

	return settlements.map((settled, index) => {
		const row = rows[index]

		if (settled.status === "fulfilled") {
			return <div key={row.id}>{settled.value}</div>
		}

		// eslint-disable-next-line no-console
		console.error(`[ProjectPage] ${label} markdown render failed`, {
			projectSlug,
			[idField]: row.id,
			...describeRenderFailure(settled.reason),
		})

		return <p key={row.id}>{markdownOf(row)}</p>
	})
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
		// `metaDescription` when set: `summary` doubles as the own-app hero
		// paragraph, which runs past the length a result snippet shows.
		description: project.metaDescription ?? project.summary,
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

	// The page layout is the project's own choice, independent of who owns it.
	const isProductPage = project.pageLayout === ProjectPageLayout.product

	// Section bodies, step bodies and FAQ answers are all markdown, rendered
	// here on the server so the client components (the tabs, the accordion, the
	// carousels) stay free of the pipeline. Each list is aligned by index with
	// its rows.
	const projectSlug = project.slug
	const renderedDescriptions = await renderMarkdownRows({
		rows: project.sections,
		markdownOf: (section) => section.description,
		label: "section",
		idField: "sectionId",
		projectSlug,
	})
	// Only the product page shows steps; the tabbed layout reads sections alone.
	const renderedItemDescriptions = isProductPage
		? await Promise.all(
				project.sections.map((section) =>
					renderMarkdownRows({
						rows: section.items,
						markdownOf: (item) => item.description,
						label: "step",
						idField: "itemId",
						projectSlug,
					})
				)
			)
		: []
	const renderedFaqAnswers = await renderMarkdownRows({
		rows: project.faqs,
		markdownOf: (faq) => faq.answer,
		label: "FAQ",
		idField: "faqId",
		projectSlug,
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

	const portfolioPage = (
		<ProjectContent
			project={project}
			renderedDescriptions={renderedDescriptions}
			renderedFaqAnswers={renderedFaqAnswers}
			guides={guides}
		/>
	)
	let page: ReactNode

	// A switch, not a ternary: a new layout fails the type-check here until it
	// has a page. One this code doesn't know (a database ahead of the deploy)
	// gets the portfolio page, and the log says so.
	switch (project.pageLayout) {
		case ProjectPageLayout.product:
			page = (
				<ProductPage
					project={project}
					renderedDescriptions={renderedDescriptions}
					renderedItemDescriptions={renderedItemDescriptions}
					renderedFaqAnswers={renderedFaqAnswers}
					guides={guides}
				/>
			)
			break
		case ProjectPageLayout.portfolio:
			page = portfolioPage
			break
		default: {
			const unknown: never = project.pageLayout
			// eslint-disable-next-line no-console
			console.error(
				"[projects:page] unknown page layout, showing the portfolio page",
				{ slug: project.slug, pageLayout: unknown }
			)
			page = portfolioPage
		}
	}

	return (
		<>
			<JsonLdScript data={faqJsonLd} />
			<JsonLdScript data={softwareJsonLd} />

			{page}
		</>
	)
}
