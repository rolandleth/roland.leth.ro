import { toJsxRuntime } from "hast-util-to-jsx-runtime"
import { jsx, jsxs, Fragment } from "react/jsx-runtime"
import rehypePrettyCode from "rehype-pretty-code"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import type { ReactNode } from "react"
import type { Options } from "rehype-pretty-code"

const prettyCodeOptions: Options = {
	theme: {
		light: "github-light",
		dark: "github-dark-dimmed",
	},
}

// Built once and reused; `unified().use(...)` is expensive enough that constructing it per call wastes allocations on hot paths like the feed.
const markdownProcessor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkRehype)
	.use(rehypePrettyCode, prettyCodeOptions)

export async function markdownToReact(content: string): Promise<ReactNode> {
	const hast = await markdownProcessor.run(markdownProcessor.parse(content))

	return toJsxRuntime(hast, { Fragment, jsx, jsxs })
}

type MdastNode = { type: string; value?: string; children?: MdastNode[] }

// Block-level node types whose text content should be separated by whitespace
// when multiple appear as siblings, so paragraphs don't run together after joining.
const BLOCK_TYPES = new Set(["paragraph", "heading", "blockquote", "listItem"])

function extractText(node: MdastNode): string {
	// Fenced code blocks produce noise in plain-text excerpts; skip them entirely.
	if (node.type === "code") {
		return ""
	}

	if (node.value !== undefined) {
		return node.value
	}

	const text = (node.children ?? []).map(extractText).join("")

	return BLOCK_TYPES.has(node.type) ? text + "\n" : text
}

const textOnlyProcessor = unified().use(remarkParse).use(remarkGfm)

/** Strips all markdown syntax and returns plain text. Fenced code blocks are omitted entirely; inline code values are kept. */
export function stripMarkdown(markdown: string): string {
	const tree = textOnlyProcessor.parse(markdown) as unknown as MdastNode

	return extractText(tree).replace(/\s+/g, " ").trim()
}
