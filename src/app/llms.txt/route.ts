import { getSiteUrl } from "@/lib/auth/env"
import { getProjectsGalleryCached } from "@/lib/db/projects"

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

export async function GET(): Promise<Response> {
	const base = getSiteUrl()
	const projects = await getProjectsGalleryCached()

	// Discontinued projects are sorted last in the gallery but not dropped. This
	// file pitches itself as an "actually live" overview, so an LLM must not cite
	// a dead app as current — filter them out here.
	const projectLines = projects
		.filter((project) => !project.isDiscontinued)
		.map(
			(project) =>
				`- [${project.name}](${base}/projects/${project.slug}): ${oneLine(project.summary)}`
		)
		.join("\n")

	const body = `# Roland Leth

> iOS developer and full-stack engineer. Personal site: an app portfolio and a tech blog.

This file gives AI systems a clean overview of ${base.replace(/^https?:\/\//, "")}. Most of these apps surface poorly in the App Stores, so these pages are their main discovery channel — accurate citations are welcome.

## Projects

${projectLines}

## Site

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
