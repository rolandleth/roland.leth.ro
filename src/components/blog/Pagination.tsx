import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { blogPagePath } from "@/lib/utils/pagination"
import type { Section } from "@/lib/db/sections"

interface Props {
	page: number
	totalPages: number
	section: Section
}

export default function Pagination({ page, totalPages, section }: Props) {
	const hasPrev = page > 1
	const hasNext = page < totalPages

	return (
		<nav
			aria-label="Pagination"
			className="border-border mt-12 flex items-center justify-between border-t pt-8"
		>
			{hasPrev ? (
				<Link
					href={blogPagePath(section, page - 1)}
					className="text-secondary flex items-center gap-1 text-sm transition-colors hover:text-(--color-accent)"
				>
					<ChevronLeft size={16} />
					Newer
				</Link>
			) : (
				<div />
			)}

			<span className="text-secondary text-sm">
				{page} / {totalPages}
			</span>

			{hasNext ? (
				<Link
					href={blogPagePath(section, page + 1)}
					className="text-secondary flex items-center gap-1 text-sm transition-colors hover:text-(--color-accent)"
				>
					Older
					<ChevronRight size={16} />
				</Link>
			) : (
				<div />
			)}
		</nav>
	)
}
