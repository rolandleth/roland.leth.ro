"use client"

import {
	useState,
	useEffect,
	useDeferredValue,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
} from "react"
import { markdownToReact } from "@/lib/content/markdown"
import { insertMarkdownBlock } from "@/lib/utils/markdownInsert"
import type { ReactNode, Ref, SyntheticEvent } from "react"

export interface MarkdownEditorHandle {
	/**
	 * Inserts `block` as a paragraph of its own next to where the cursor last
	 * was (see `insertMarkdownBlock` for where exactly), or at the end when the
	 * textarea never had one. Nothing is replaced, a selection included. The
	 * cursor then goes `cursorOffset` characters into the block (after it, when
	 * omitted) and the textarea takes focus. In preview, both wait for the
	 * switch back to Edit.
	 */
	insertBlock: (block: string, cursorOffset?: number) => void
}

interface Props {
	value: string
	onChange: (value: string) => void
	placeholder?: string
	ref?: Ref<MarkdownEditorHandle>
}

export default function MarkdownEditor({
	value,
	onChange,
	placeholder,
	ref,
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
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	// The cursor as last seen (the end of the selection, when there is one).
	// Remembered here rather than read off the textarea when needed, because
	// the textarea unmounts in preview and takes its selection with it.
	const cursorRef = useRef<number | null>(null)
	// Where to put the cursor once the inserted text has rendered. Setting it
	// right after `onChange` would act on the old value: the parent owns it.
	const pendingCursorRef = useRef<number | null>(null)

	useImperativeHandle(
		ref,
		() => ({
			insertBlock(block, cursorOffset = block.length) {
				const insertion = insertMarkdownBlock(
					value,
					block,
					cursorRef.current ?? value.length
				)
				const cursor = insertion.blockStart + cursorOffset

				cursorRef.current = cursor
				pendingCursorRef.current = cursor
				onChange(insertion.text)
			},
		}),
		[value, onChange]
	)

	// A layout effect, so the cursor moves before the browser paints the new
	// text with it at the end. Runs on `isPreview` too: an insert made in
	// preview has no textarea to act on until the switch back.
	useLayoutEffect(() => {
		const cursor = pendingCursorRef.current
		const textarea = textareaRef.current

		if (cursor == null || textarea == null) {
			return
		}

		pendingCursorRef.current = null
		textarea.focus()
		textarea.setSelectionRange(cursor, cursor)
	}, [value, isPreview])

	useEffect(() => {
		if (!isPreview) {
			return
		}

		if (lastParseRef.current?.input === deferredValue) {
			setPreview(lastParseRef.current.node)
			return
		}

		// Cache miss: clear the stale preview synchronously so the "Rendering…"
		// placeholder shows while the async pipeline runs. Without this the
		// user sees the PREVIOUS parsed body until `markdownToReact` resolves
		// (e.g. edit text → Preview → see the pre-edit render flash before the
		// new one).
		setPreview(null)

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

	function rememberCursor(event: SyntheticEvent<HTMLTextAreaElement>) {
		cursorRef.current = event.currentTarget.selectionEnd
	}

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
				<div className="border-border prose dark:prose-invert min-h-64 max-w-none rounded-md border p-4">
					{preview ?? (
						<span className="text-secondary text-sm">Rendering…</span>
					)}
				</div>
			) : (
				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => {
						rememberCursor(e)
						onChange(e.target.value)
					}}
					// Fires for every cursor move, by key or pointer, not only for a
					// selected range.
					onSelect={rememberCursor}
					placeholder={placeholder}
					rows={20}
					className="admin-input min-h-64 font-mono"
				/>
			)}
		</div>
	)
}
