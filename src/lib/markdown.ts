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

export async function markdownToReact(content: string): Promise<ReactNode> {
	const processor = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype)
		.use(rehypePrettyCode, prettyCodeOptions)

	const hast = await processor.run(processor.parse(content))

	return toJsxRuntime(hast, { Fragment, jsx, jsxs })
}
