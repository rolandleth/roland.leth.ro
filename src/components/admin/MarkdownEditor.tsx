"use client"

import { toJsxRuntime } from "hast-util-to-jsx-runtime"
import { useState, useEffect } from "react"
import { jsx, jsxs, Fragment } from "react/jsx-runtime"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import type { ReactNode } from "react"

async function renderMarkdown(content: string): Promise<ReactNode> {
	const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype)
	const hast = await processor.run(processor.parse(content))

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return toJsxRuntime(hast as any, { Fragment, jsx, jsxs } as any)
}

interface Props {
	value: string
	onChange: (value: string) => void
	placeholder?: string
}

export default function MarkdownEditor({
	value,
	onChange,
	placeholder,
}: Props) {
	const [isPreview, setIsPreview] = useState(false)
	const [preview, setPreview] = useState<ReactNode>(null)

	useEffect(() => {
		if (!isPreview) {
			return
		}

		let cancelled = false

		renderMarkdown(value).then((node) => {
			if (!cancelled) {
				setPreview(node)
			}
		})

		return () => {
			cancelled = true
		}
	}, [isPreview, value])

	return (
		<div className="flex flex-col gap-2">
			<div className="flex gap-1">
				<button
					type="button"
					onClick={() => setIsPreview(false)}
					className={`rounded-md px-3 py-1 text-sm transition-colors ${
						!isPreview
							? "bg-accent text-white"
							: "text-secondary hover:text-primary"
					}`}
				>
					Edit
				</button>
				<button
					type="button"
					onClick={() => setIsPreview(true)}
					className={`rounded-md px-3 py-1 text-sm transition-colors ${
						isPreview
							? "bg-accent text-white"
							: "text-secondary hover:text-primary"
					}`}
				>
					Preview
				</button>
			</div>

			{isPreview ? (
				<div className="border-border prose dark:prose-invert min-h-64 rounded-md border p-4">
					{preview ?? (
						<span className="text-secondary text-sm">Rendering…</span>
					)}
				</div>
			) : (
				<textarea
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					rows={20}
					className="border-border bg-background text-primary focus:border-accent min-h-64 rounded-md border px-3 py-2 font-mono text-sm transition-colors outline-none"
				/>
			)}
		</div>
	)
}
