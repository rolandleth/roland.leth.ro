"use client"

import { useState, useEffect } from "react"
import { markdownToReact } from "@/lib/markdown"
import type { ReactNode } from "react"

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

		markdownToReact(value).then((node) => {
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
					className="admin-input min-h-64 font-mono"
				/>
			)}
		</div>
	)
}
