import { escapeYamlDoubleQuoted } from "@/lib/import/frontmatter"
import { formatDate, postDatetimeToISO } from "@/lib/utils/format"
import type { PostDetail, PostRef, ScheduledPost } from "@/lib/db/posts"

/** The fields both the live export and the scheduled stub describe themselves with. */
interface MarkdownPostIdentity {
	title: string
	slug: string
	section: string
	datetime: string
}

/**
 * The frontmatter keys shared by every markdown view of a post, as lines. Both
 * builders below emit these; the scheduled stub appends to them rather than
 * hand-rolling its own block, so a title with a `"` in it is escaped the same
 * way on both paths.
 */
function postFrontmatterLines(
	post: MarkdownPostIdentity,
	base: string
): string[] {
	const publishedIso = postDatetimeToISO(post.datetime)

	return [
		`title: "${escapeYamlDoubleQuoted(post.title)}"`,
		`slug: ${post.slug}`,
		`section: ${post.section}`,
		// Omit the line entirely rather than emit `date: undefined` when a legacy
		// row's `datetime` doesn't parse — `postDatetimeToISO` returns undefined there.
		...(publishedIso ? [`date: ${publishedIso}`] : []),
		`canonical: ${base}/blog/${post.section}/${post.slug}`,
	]
}

/** Wraps frontmatter lines in the `---` fence. */
function frontmatterBlock(lines: string[]): string {
	return `---\n${lines.join("\n")}\n---`
}

/**
 * Serializes a post as a self-describing markdown file: a YAML frontmatter block
 * (title, slug, section, publication date, canonical URL) followed by the raw
 * body, verbatim. This is what `/blog/:section/:slug.md` returns — a plain-text
 * form humans and AI systems can read without parsing the rendered HTML.
 *
 * The frontmatter is a strict superset of what the post importer consumes:
 * `parseFrontmatter` only reads the `title:` and `slug:` lines and ignores
 * every other key, so an exported `.md` round-trips through `db:import-posts`
 * exactly — even when the stored slug no longer matches what the title would
 * derive — and the extra keys are informational (the importer derives the
 * stored `datetime` from the filename, not from `date:`). The body is emitted
 * unchanged so `parseFrontmatter(...).body` equals `post.body` byte-for-byte for
 * any body with no leading blank lines.
 */
export function buildPostMarkdownFile(post: PostDetail, base: string): string {
	return `${frontmatterBlock(postFrontmatterLines(post, base))}\n\n${post.body}`
}

/**
 * The stub `/blog/:section/:slug.md` returns for a post that is published but
 * still future-dated — the machine-facing twin of `ScheduledPostNotice`.
 *
 * It carries the same frontmatter as a real export plus `scheduled: true`, so a
 * consumer can tell "not published yet" from "malformed export" without
 * guessing. The route's `X-Robots-Tag: noindex` only reaches search crawlers; an
 * agent fetching the URL directly sees nothing but this body, and a bare `#
 * Title` would read as the post's actual content. `date:` is the future
 * publication date, which is the same thing the key means on a live export.
 */
export function buildScheduledPostMarkdownFile(
	scheduled: ScheduledPost,
	ref: PostRef,
	base: string
): string {
	const lines = postFrontmatterLines(
		{
			title: scheduled.title,
			slug: ref.slug,
			section: ref.section,
			datetime: scheduled.datetime,
		},
		base
	)

	return `${frontmatterBlock([...lines, "scheduled: true"])}\n\n# ${scheduled.title}\n\nScheduled: this post goes live on ${formatDate(scheduled.datetime)}.\n`
}
