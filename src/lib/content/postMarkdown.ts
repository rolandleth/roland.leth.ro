import { escapeYamlDoubleQuoted } from "@/lib/import/frontmatter"
import { postDatetimeToISO } from "@/lib/utils/format"
import type { PostDetail } from "@/lib/db/posts"

/**
 * Serializes a post as a self-describing markdown file: a YAML frontmatter block
 * (title, section, publication date, canonical URL) followed by the raw body,
 * verbatim. This is what `/blog/:section/:slug.md` returns — a plain-text form
 * humans and AI systems can read without parsing the rendered HTML.
 *
 * The frontmatter is a strict superset of what the post importer consumes:
 * `parseFrontmatter` only reads the `title:` line and ignores every other key,
 * so an exported `.md` round-trips through `db:import-posts` — the title is
 * preserved and the extra keys are informational (the importer derives the
 * stored `datetime` from the filename, not from `date:`). The body is emitted
 * unchanged so `parseFrontmatter(...).body` equals `post.body` byte-for-byte for
 * any body with no leading blank lines.
 */
export function buildPostMarkdownFile(post: PostDetail, base: string): string {
	const canonical = `${base}/blog/${post.section}/${post.slug}`
	const publishedIso = postDatetimeToISO(post.datetime)

	const frontmatter = [
		`title: "${escapeYamlDoubleQuoted(post.title)}"`,
		`section: ${post.section}`,
		// Omit the line entirely rather than emit `date: undefined` when a legacy
		// row's `datetime` doesn't parse — `postDatetimeToISO` returns undefined there.
		...(publishedIso ? [`date: ${publishedIso}`] : []),
		`canonical: ${canonical}`,
	].join("\n")

	return `---\n${frontmatter}\n---\n\n${post.body}`
}
