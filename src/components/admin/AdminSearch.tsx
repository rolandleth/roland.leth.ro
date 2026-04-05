"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

interface Props {
	tab: "posts" | "projects"
	query: string
}

export default function AdminSearch({ tab, query }: Props) {
	const [isSearching, setIsSearching] = useState(query.length > 0)
	const inputRef = useRef<HTMLInputElement>(null)
	const formRef = useRef<HTMLFormElement>(null)
	const router = useRouter()

	const tabBase = tab === "posts" ? "/admin" : "/admin?tab=projects"

	const closeSearch = useCallback(() => {
		setIsSearching(false)
		router.push(tabBase)
	}, [router, tabBase])

	useEffect(() => {
		if (!isSearching) {
			return
		}

		function handleMouseDown(e: MouseEvent) {
			if (formRef.current && !formRef.current.contains(e.target as Node)) {
				closeSearch()
			}
		}

		document.addEventListener("mousedown", handleMouseDown)

		return () => document.removeEventListener("mousedown", handleMouseDown)
	}, [isSearching, closeSearch])

	function openSearch() {
		setIsSearching(true)
		setTimeout(() => inputRef.current?.focus(), 50)
	}

	function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
		e.preventDefault()
		const q = inputRef.current?.value.trim() ?? ""

		if (q.length === 0) {
			return
		}

		const separator = tab === "posts" ? "?" : "&"
		router.push(`${tabBase}${separator}q=${encodeURIComponent(q)}`)
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Escape") {
			closeSearch()
		}
	}

	return (
		<AnimatePresence mode="wait" initial={false}>
			{isSearching ? (
				<motion.form
					ref={formRef}
					key="search"
					onSubmit={handleSubmit}
					className="ml-auto flex items-center gap-2"
					initial={{ opacity: 0, x: 6 }}
					animate={{ opacity: 1, x: 0 }}
					exit={{ opacity: 0, x: 6 }}
					transition={{ duration: 0.2, ease: "easeOut" }}
				>
					<input
						ref={inputRef}
						type="search"
						name="q"
						defaultValue={query}
						placeholder="Search…"
						onKeyDown={handleKeyDown}
						className="border-border focus:border-accent w-40 border-b bg-transparent pb-0.5 text-sm transition-colors outline-none placeholder:opacity-40"
					/>
					<button
						type="button"
						onClick={closeSearch}
						aria-label="Cancel search"
						className="text-secondary cursor-pointer transition-colors hover:text-(--color-accent)"
					>
						<X size={16} />
					</button>
				</motion.form>
			) : (
				<motion.button
					key="icon"
					type="button"
					onClick={openSearch}
					aria-label="Search"
					className="text-secondary ml-auto cursor-pointer transition-colors hover:text-(--color-accent)"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.15 }}
				>
					<Search size={16} />
				</motion.button>
			)}
		</AnimatePresence>
	)
}
