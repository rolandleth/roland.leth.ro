"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Search, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import SearchForm from "./SearchForm"

interface Props {
	section: string
	label: string
}

export default function BlogSectionHeader({ section, label }: Props) {
	const [isSearching, setIsSearching] = useState(false)
	const formRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!isSearching) {
			return
		}

		function handleMouseDown(e: MouseEvent) {
			if (formRef.current && !formRef.current.contains(e.target as Node)) {
				setIsSearching(false)
			}
		}

		document.addEventListener("mousedown", handleMouseDown)

		return () => document.removeEventListener("mousedown", handleMouseDown)
	}, [isSearching])

	return (
		<div className="mb-2 flex h-10 items-center">
			<AnimatePresence mode="wait" initial={false}>
				{isSearching ? (
					<motion.div
						ref={formRef}
						key="search"
						className="w-full"
						initial={{ opacity: 0, y: -6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
					>
						<SearchForm
							section={section}
							placeholder={`Search ${label.toLowerCase()}…`}
							autoFocus
							onKeyDownEscape={() => setIsSearching(false)}
							action={
								<button
									type="button"
									onClick={() => setIsSearching(false)}
									aria-label="Cancel search"
									className="text-secondary shrink-0 cursor-pointer transition-colors duration-300 hover:text-(--color-accent)"
								>
									<X size={20} />
								</button>
							}
						/>
					</motion.div>
				) : (
					<motion.div
						key="heading"
						className="flex w-full items-center justify-between"
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 6 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
					>
						<h1 className="text-3xl font-bold">{label}</h1>
						<button
							type="button"
							onClick={() => setIsSearching(true)}
							aria-label="Search posts"
							className="text-secondary cursor-pointer transition-colors duration-300 hover:text-(--color-accent)"
						>
							<Search size={20} />
						</button>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}
