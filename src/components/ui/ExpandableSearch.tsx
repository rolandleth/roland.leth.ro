"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Search, X } from "lucide-react"
import { useRef, useState } from "react"
import { useClickOutside } from "./useClickOutside"

interface Props {
	placeholder: string
	onSubmit: (query: string) => void
	initialValue?: string
	className?: string
	autoFocusOnOpen?: boolean
}

export default function ExpandableSearch({
	placeholder,
	onSubmit,
	initialValue = "",
	className,
	autoFocusOnOpen = true,
}: Props) {
	const [isOpen, setIsOpen] = useState(initialValue.length > 0)
	const inputRef = useRef<HTMLInputElement>(null)
	const formRef = useRef<HTMLFormElement>(null)

	useClickOutside(formRef, () => setIsOpen(false), isOpen)

	function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		const query = inputRef.current?.value.trim() ?? ""

		if (query.length === 0) {
			return
		}

		onSubmit(query)
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (event.key === "Escape") {
			setIsOpen(false)
		}
	}

	function handleOpenAnimationComplete() {
		if (!autoFocusOnOpen) {
			return
		}

		inputRef.current?.focus()
	}

	const wrapperClassName = ["flex items-center", className ?? ""]
		.filter((c) => c !== "")
		.join(" ")

	return (
		<div className={wrapperClassName}>
			<AnimatePresence mode="wait" initial={false}>
				{isOpen ? (
					<motion.form
						ref={formRef}
						key="search"
						onSubmit={handleSubmit}
						className="flex items-center gap-2"
						initial={{ opacity: 0, x: 6 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: 6 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
						onAnimationComplete={handleOpenAnimationComplete}
					>
						<input
							ref={inputRef}
							type="search"
							name="q"
							defaultValue={initialValue}
							placeholder={placeholder}
							onKeyDown={handleKeyDown}
							className="border-border focus:border-accent w-40 border-b bg-transparent pb-0.5 text-sm transition-colors outline-none placeholder:opacity-40"
						/>
						<button
							type="button"
							onClick={() => setIsOpen(false)}
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
						onClick={() => setIsOpen(true)}
						aria-label="Search"
						className="text-secondary cursor-pointer transition-colors hover:text-(--color-accent)"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
					>
						<Search size={16} />
					</motion.button>
				)}
			</AnimatePresence>
		</div>
	)
}
