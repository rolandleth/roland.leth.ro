import { escapeYamlDoubleQuoted } from "@/lib/import/frontmatter"
import type { GuideDetail } from "@/lib/db/guides"

/**
 * Serializes a guide as a self-describing markdown file: a YAML frontmatter
 * block (title, slug, description, the topic and project it belongs to when it
 * has them, the last update, the canonical URL) followed by the raw body,
 * verbatim. This is what `/guides/:slug.md` returns — the guide twin of
 * `buildPostMarkdownFile`, kept separate because the two advertise different
 * fields: a guide has no section and no publish date worth leading with, and
 * its `updated:` is the freshness signal the page itself puts in the dateline.
 *
 * Deliberately not a round-trip format for `db:import-guides`: that importer
 * rejects unknown keys, and `topic`, `project`, `updated` and `canonical` are
 * informational here. The content repo is the source of truth for guides; this
 * export exists for readers and agents, not for re-import.
 */
export function buildGuideMarkdownFile(
	guide: GuideDetail,
	base: string
): string {
	const lines = [
		`title: "${escapeYamlDoubleQuoted(guide.title)}"`,
		`slug: ${guide.slug}`,
		`description: "${escapeYamlDoubleQuoted(guide.description)}"`,
		...(guide.topic == null ? [] : [`topic: ${guide.topic.slug}`]),
		...(guide.projectSlug == null ? [] : [`project: ${guide.projectSlug}`]),
		// `unstable_cache` may hand `updatedAt` back as an ISO string, so it's
		// normalized through `new Date(...)` like the JSON-LD builder does.
		`updated: ${new Date(guide.updatedAt).toISOString()}`,
		`canonical: ${base}/guides/${guide.slug}`,
	]

	return `---\n${lines.join("\n")}\n---\n\n${guide.body}`
}
