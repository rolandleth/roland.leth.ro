"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

interface Props {
	section: string
	/** Pre-fills the input, e.g. when showing results for a previous query. */
	defaultValue?: string
	placeholder?: string
	/** Rendered to the right of the input, e.g. a close button. */
	action?: React.ReactNode
	className?: string
	autoFocus?: boolean
	onKeyDownEscape?: () => void
}

export default function SearchForm({
	section,
	defaultValue,
	placeholder,
	action,
	className,
	autoFocus,
	onKeyDownEscape,
}: Props) {
	const inputRef = useRef<HTMLInputElement>(null)
	const router = useRouter()

	// Imperative focus (instead of `autoFocus` on the input) so focus moves
	// after React mounts the element — same pattern as `ExpandableSearch`. The
	// declarative `autoFocus` attribute fires synchronously during render in
	// some browsers and can race AnimatePresence's enter transition; doing it
	// here in a layout-time effect avoids the race.
	useEffect(() => {
		if (autoFocus) {
			inputRef.current?.focus()
		}
	}, [autoFocus])

	function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
		e.preventDefault()
		const q = inputRef.current?.value.trim() ?? ""

		if (q.length === 0) {
			return
		}

		router.push(`/blog/${section}/search?q=${encodeURIComponent(q)}`)
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Escape") {
			onKeyDownEscape?.()
		}
	}

	return (
		<form
			onSubmit={handleSubmit}
			className={`flex w-full items-center gap-3 ${className ?? ""}`}
		>
			<input
				ref={inputRef}
				type="search"
				name="q"
				defaultValue={defaultValue}
				placeholder={placeholder}
				onKeyDown={handleKeyDown}
				className="w-full border-b border-(--color-border) bg-transparent pb-1 text-3xl font-bold transition-colors duration-300 outline-none placeholder:font-normal placeholder:opacity-40 focus:border-(--color-accent)"
			/>
			{action}
		</form>
	)
}
