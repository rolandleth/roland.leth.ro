"use client"

import { useState, useEffect, useDeferredValue, useRef } from "react"
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
	// `useDeferredValue` already coalesces rapid edits by letting React drop
	// stale renders, so no additional setTimeout debounce is needed.
	const deferredValue = useDeferredValue(value)
	// Bounded (size 1) cache of the last `(input → node)` pair. Toggling the
	// preview panel back and forth with the same content would otherwise re-run
	// the full unified → rehype pipeline on every mount. One entry is enough for
	// the Edit↔Preview toggle case; larger histories rarely help and grow with
	// typing.
	const lastParseRef = useRef<{ input: string; node: ReactNode } | null>(null)

	useEffect(() => {
		if (!isPreview) {
			return
		}

		if (lastParseRef.current?.input === deferredValue) {
			setPreview(lastParseRef.current.node)
			return
		}

		let cancelled = false

		markdownToReact(deferredValue)
			.then((node) => {
				if (cancelled) {
					return
				}

				lastParseRef.current = { input: deferredValue, node }
				setPreview(node)
			})
			.catch((err: unknown) => {
				if (cancelled) {
					return
				}

				const message = err instanceof Error ? err.message : "unknown error"
				setPreview(
					<span className="text-sm text-red-500">
						Preview failed to render: {message}
					</span>
				)
			})

		return () => {
			cancelled = true
		}
	}, [isPreview, deferredValue])

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
