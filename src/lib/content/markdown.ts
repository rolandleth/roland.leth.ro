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

const TRUNCATE_MIN_LENGTH = 900
const TRUNCATE_TARGET_LENGTH = 700

/**
 * Returns the start offset of the code block containing `offset`, or `null` when
 * the offset sits outside every code block.
 *
 * Asking the parser rather than scanning for fence delimiters covers the cases a
 * regex misses: tilde fences, fences indented up to three spaces, info strings,
 * indented (four-space) code blocks, and fences nested in a list or blockquote.
 */
function enclosingCodeBlockStart(markdown: string, offset: number) {
	const tree = textOnlyProcessor.parse(markdown)
	let start: number | null = null

	function walk(node: Nodes) {
		if (node.type === "code") {
			const nodeStart = node.position?.start.offset
			const nodeEnd = node.position?.end.offset

			if (nodeStart != null && nodeEnd != null) {
				if (offset > nodeStart && offset < nodeEnd) {
					start = nodeStart
				}
			}

			return
		}

		if (!("children" in node)) {
			return
		}

		for (const child of node.children) {
			walk(child)
		}
	}

	walk(tree)

	return start
}

/**
 * Truncates a raw markdown body at a paragraph boundary near `TRUNCATE_TARGET_LENGTH` chars,
 * but only if the body exceeds `TRUNCATE_MIN_LENGTH` chars. Returns the text and whether
 * it was truncated (to decide whether to show "Continue reading").
 *
 * Lives here rather than with the generic formatters because the cut has to
 * respect markdown block structure, which needs the parser — and `format.ts`
 * reaches client components, where importing the pipeline would ship Shiki to
 * the browser.
 */
export function truncateBody(body: string): {
	text: string
	isTruncated: boolean
} {
	if (body.length < TRUNCATE_MIN_LENGTH) {
		return { text: body, isTruncated: false }
	}

	const candidate = body.slice(0, TRUNCATE_TARGET_LENGTH)
	const lastBreak = candidate.lastIndexOf("\n\n")
	const paragraphCut = lastBreak > 0 ? lastBreak : TRUNCATE_TARGET_LENGTH

	// A code block can contain blank lines, so the paragraph cut above can land
	// inside one. Pull back to the block's start rather than emit half of it.
	// A block starting at offset 0 has nowhere to pull back to, so the partial
	// block stands — it still renders, since an unclosed fence runs to the end.
	const codeBlockStart = enclosingCodeBlockStart(body, paragraphCut)
	const codeSafeCut =
		codeBlockStart != null && codeBlockStart > 0 ? codeBlockStart : paragraphCut

	// Trim before a heading block so we don't show the heading without its
	// content. Runs after the code-block pull-back, which can itself strand a
	// heading that introduced the block.
	const slicedText = body.slice(0, codeSafeCut)
	const lastHeadingBreak = slicedText.lastIndexOf("\n\n#")
	const finalCutPoint = lastHeadingBreak > 0 ? lastHeadingBreak : codeSafeCut

	// A pull-back cuts at the block's own start offset, which leaves the blank
	// line that preceded it dangling on the end.
	return { text: body.slice(0, finalCutPoint).trimEnd(), isTruncated: true }
}

function collectDefinitionSources(
	node: Nodes,
	markdown: string,
	out: string[]
) {
	if (node.type === "definition") {
		const start = node.position?.start.offset
		const end = node.position?.end.offset

		// Positions are always present on a tree straight from remark-parse, but
		// the mdast types mark them optional. Skip rather than emit a broken line.
		if (start != null && end != null) {
			out.push(markdown.slice(start, end))
		}

		return
	}

	if (!("children" in node)) {
		return
	}

	for (const child of node.children) {
		collectDefinitionSources(child, markdown, out)
	}
}

/**
 * Returns the link reference definitions (`[label]: /url "Title"`) found in a
 * markdown body, as their original source lines joined by blank lines.
 *
 * Definitions are conventionally written at the bottom of a post, so any excerpt
 * that cuts above them loses them, and every `[text][label]` in that excerpt
 * renders as literal brackets instead of a link. Appending the result of this to
 * a truncated excerpt restores those links. A definition whose label is never
 * referenced renders nothing, so returning all of them is safe.
 *
 * Slices the source by node position instead of rebuilding the line from
 * `label`/`url`/`title`, which keeps quoted titles and spaced URLs intact
 * without any escaping. The walk is recursive because a definition can sit
 * inside a blockquote or list item and still resolve document-wide.
 */
export function extractDefinitions(markdown: string): string {
	const tree = textOnlyProcessor.parse(markdown)
	const sources: string[] = []

	collectDefinitionSources(tree, markdown, sources)

	return sources.join("\n\n")
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
