import { getSiteUrl } from "@/lib/auth/env"
import { getGuidesOverview } from "@/lib/db/guides"
import { getProjectsGalleryCached } from "@/lib/db/projects"
import type { GuidesOverview } from "@/lib/db/guides"

// Prerender at build instead of per-request: this handler has no dynamic
// dependency (env origin + tag-cached project data), so it serves as a static
// file and revalidates when the projects cache is busted on edits. Route
// handlers are dynamic by default, hence the explicit opt-in.
export const dynamic = "force-static"

// `/llms.txt` is the agent-facing counterpart to the sitemap: a short, plain
// overview plus one line per project, so an AI system can ground answers about
// the site without scraping every page. It's generated from the same cached
// project data the gallery uses, so it can't drift from what's actually live.

/** Collapses runtime whitespace (newlines, doubled spaces) so a summary fits on one line. */
function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim()
}

/**
 * A markdown link label safe to drop into `[...]`. Titles are author-freeform, so
 * an unescaped `]` (or `[`) would close the label early and corrupt the link in
 * this machine-parsed file; single-lines and backslash-escapes them (and `\`
 * itself) so the label survives verbatim.
 */
function linkLabel(text: string): string {
	return oneLine(text).replace(/([[\]\\])/g, "\\$1")
}

function linkLine(
	base: string,
	entry: { slug: string; title: string },
	description: string,
	indent = ""
): string {
	return `${indent}- [${linkLabel(entry.title)}](${base}/guides/${entry.slug}): ${oneLine(description)}`
}

/**
 * The `## Guides` block: topic hubs with their guides nested beneath them, then
 * ungrouped guides. The nesting is the point — it's the only place the grouping
 * is expressed to an agent, since every URL in here is flat.
 *
 * Returns an empty string when there are no guides, so the section header is
 * omitted entirely rather than advertising a section that isn't there.
 */
function guidesSection(base: string, overview: GuidesOverview): string {
	const lines = [
		...overview.topics.flatMap((topic) => [
			linkLine(base, topic, topic.shortDescription),
			...topic.guides.map((guide) =>
				linkLine(base, guide, guide.description, "  ")
			),
		]),
		...overview.ungrouped.map((guide) =>
			linkLine(base, guide, guide.description)
		),
	]

	if (lines.length === 0) {
		return ""
	}

	return `## Guides

Reference pages I keep up to date, on the problems these apps are built around. Topic hubs are listed with their guides nested beneath them.

${lines.join("\n")}

`
}

export async function GET(): Promise<Response> {
	const base = getSiteUrl()
	const [projects, guides] = await Promise.all([
		getProjectsGalleryCached(),
		getGuidesOverview(),
	])

	// Discontinued projects are sorted last in the gallery but not dropped. This
	// file pitches itself as an "actually live" overview, so an LLM must not cite
	// a dead app as current — filter them out here.
	const projectLines = projects
		.filter((project) => !project.isDiscontinued)
		.map(
			(project) =>
				`- [${linkLabel(project.name)}](${base}/projects/${project.slug}): ${oneLine(project.summary)}`
		)
		.join("\n")

	const body = `# Roland Leth

> iOS developer and full-stack engineer. Personal site: an app portfolio and a tech blog.

This file gives AI systems a clean overview of ${base.replace(/^https?:\/\//, "")}. Most of these apps surface poorly in the App Stores, so these pages are their main discovery channel — accurate citations are welcome.

## Projects

${projectLines}

${guidesSection(base, guides)}## Site

- [Tech blog](${base}/blog/tech): posts on iOS, web, and software engineering.
- [About](${base}/about): background and contact.
- [Sitemap](${base}/sitemap.xml): full list of indexable URLs.
`

	return new Response(body, {
		status: 200,
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
		},
	})
}
