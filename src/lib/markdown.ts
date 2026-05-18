import { toJsxRuntime } from "hast-util-to-jsx-runtime"
import { jsx, jsxs, Fragment } from "react/jsx-runtime"
import rehypePrettyCode from "rehype-pretty-code"
import rehypeStringify from "rehype-stringify"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import type { Nodes } from "mdast"
import type { ReactNode } from "react"
import type { Options } from "rehype-pretty-code"

// All processors are built once at module load and reused.
// `unified().use(...)` allocates a new pipeline object, so constructing per call
// is wasteful on hot paths (feed, blog page renders).

const prettyCodeOptions: Options = {
	theme: {
		light: "github-light",
		dark: "github-dark-dimmed",
	},
}

// Used by markdownToReact (blog pages). Includes rehype-pretty-code for
// Shiki syntax highlighting, whose output relies on CSS classes defined in the
// site's stylesheet — not suitable for contexts without that CSS (e.g. feeds).
const markdownProcessor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkRehype)
	.use(rehypePrettyCode, prettyCodeOptions)

// Used by markdownToHtml (Atom feed <content>). Produces plain HTML without
// Shiki spans so the markup is self-contained and renders cleanly in any feed
// reader, which won't have access to the site's stylesheet.
const htmlProcessor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkRehype)
	.use(rehypeStringify)

// Used by stripMarkdown (Atom feed <summary>). Parse-only — no rehype step
// needed because we extract text directly from the mdast, never produce HTML.
const textOnlyProcessor = unified().use(remarkParse).use(remarkGfm)

/** Renders markdown to React nodes for display on blog pages. Includes Shiki syntax highlighting. */
export async function markdownToReact(content: string): Promise<ReactNode> {
	const hast = await markdownProcessor.run(markdownProcessor.parse(content))

	return toJsxRuntime(hast, { Fragment, jsx, jsxs })
}

/**
 * Renders markdown to an HTML string. Used for the Atom feed's `<content type="html">`.
 *
 * Intentionally omits syntax highlighting — feed readers don't load the site's
 * stylesheet, so Shiki's span-based output would render as unstyled monospace at
 * best and a wall of `<span>` tags at worst.
 */
export async function markdownToHtml(content: string): Promise<string> {
	const result = await htmlProcessor.process(content)

	return String(result)
}

// Block-level node types whose text content should be separated by whitespace
// when multiple appear as siblings, so paragraphs don't run together after joining.
const BLOCK_TYPES = new Set(["paragraph", "heading", "blockquote", "listItem"])

function extractText(node: Nodes): string {
	// Fenced code blocks produce noise in plain-text excerpts; skip them entirely.
	if (node.type === "code") {
		return ""
	}

	// `image` / `imageReference` store their display text in `alt`, not `value`
	// or `children`. Treat alt text like link label text — it's narrative content
	// that belongs in the excerpt.
	if (node.type === "image" || node.type === "imageReference") {
		return node.alt ?? ""
	}

	if ("value" in node) {
		return node.value
	}

	const children = "children" in node ? node.children : []
	const text = children.map(extractText).join("")

	return BLOCK_TYPES.has(node.type) ? text + "\n" : text
}

/**
 * Strips all markdown syntax and returns plain text. Used for the Atom feed's `<summary>`.
 *
 * `<summary>` is the short blurb shown in a feed reader's list view. It must be
 * plain text (Atom `type="text"`, the default) so readers can safely truncate and
 * display it without rendering HTML. The full post body goes in `<content type="html">`.
 * Fenced code blocks are omitted entirely (noise in a text excerpt); inline code
 * values are kept since they're often meaningful in-line.
 */
export function stripMarkdown(markdown: string): string {
	const tree = textOnlyProcessor.parse(markdown)

	return extractText(tree).replace(/\s+/g, " ").trim()
}

// Matches the 160-char cap on `postCreateSchema.summary` (and Google's desktop
// snippet display width). Tying derivation and the schema cap to the same
// constant means authored and auto-derived summaries are visually consistent
// and neither overflows the SEO meta description.
export const SUMMARY_MAX_CHARS = 160

/**
 * Derives a plain-text summary from a post body for use as the OG/SEO meta
 * description and the Atom feed `<summary>`. Strips markdown, collapses
 * whitespace, then truncates at the last word boundary <= `SUMMARY_MAX_CHARS`
 * and appends an ellipsis when the source was longer.
 *
 * Word-boundary truncation avoids mid-word cuts that look broken in search
 * snippets (e.g. "exploring the implementati…"). When the stripped text
 * contains no whitespace at all within the cap, falls back to a hard slice
 * so callers always get a bounded string.
 */
export function deriveSummary(markdown: string): string {
	const stripped = stripMarkdown(markdown)

	if (stripped.length <= SUMMARY_MAX_CHARS) {
		return stripped
	}

	const window = stripped.slice(0, SUMMARY_MAX_CHARS)
	const lastSpace = window.lastIndexOf(" ")
	const truncated = lastSpace > 0 ? window.slice(0, lastSpace) : window

	return `${truncated}…`
}
