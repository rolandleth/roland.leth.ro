import { getSiteUrl } from "@/lib/auth/env"
import { getGuidesOverview } from "@/lib/db/guides"
import { getRecentPosts } from "@/lib/db/posts"
import { getProjectsGalleryCached } from "@/lib/db/projects"
import type { GuidesOverview } from "@/lib/db/guides"
import type { RecentPost } from "@/lib/db/posts"

// Prerender at build instead of per-request: this handler has no dynamic
// dependency (env origin + tag-cached project data), so it serves as a static
// file and revalidates when the projects cache is busted on edits. Route
// handlers are dynamic by default, hence the explicit opt-in.
export const dynamic = "force-static"

// `/llms.txt` is the agent-facing counterpart to the sitemap: a short, plain
// overview plus one line per project, guide and recent post, so an AI system
// can ground answers about the site without scraping every page. It's
// generated from the same cached data the gallery, the guides and the blog
// list use, so it can't drift from what's actually live.

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

/**
 * The `## Posts` block: the newest tech posts with their descriptions, so an
 * agent can cite a post without crawling the list pages. The query caps the
 * count; the archive link covers everything older. Every post also serves its
 * raw markdown at its URL plus `.md`, which is worth saying once here rather
 * than per line.
 *
 * Returns an empty string when there are no posts, so the header is omitted
 * entirely rather than advertising a section that isn't there.
 */
function postsSection(base: string, posts: RecentPost[]): string {
	if (posts.length === 0) {
		return ""
	}

	const lines = posts.map(
		(post) =>
			`- [${linkLabel(post.title)}](${base}/blog/${post.section}/${post.slug}): ${oneLine(post.description)}`
	)

	return `## Posts

The newest posts on the tech blog, with their descriptions. The full archive is at ${base}/blog/tech/archive, and every post serves its raw markdown at its URL with \`.md\` appended.

${lines.join("\n")}

`
}

export async function GET(): Promise<Response> {
	const base = getSiteUrl()
	const [projects, guides, posts] = await Promise.all([
		getProjectsGalleryCached(),
		getGuidesOverview(),
		getRecentPosts("tech"),
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

${guidesSection(base, guides)}${postsSection(base, posts)}## Site

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
