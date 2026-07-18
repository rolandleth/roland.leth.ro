"use client"

import Link from "next/link"
import ProseShell from "@/components/ui/ProseShell"

interface Props {
	title: string
	/** Pre-formatted server-side (see `formatDateValue`) so this stays timezone-agnostic. */
	formattedUpdatedAt: string
	/** ISO 8601 for the `<time datetime>` attribute; mirrors JSON-LD `dateModified`. */
	updatedAtIso: string
	readingTime: string | null
	topic: { slug: string; title: string } | null
	children: React.ReactNode
}

export default function GuideContent({
	title,
	formattedUpdatedAt,
	updatedAtIso,
	readingTime,
	topic,
	children,
}: Props) {
	return (
		<ProseShell
			header={
				<>
					{topic && (
						<Link
							href={`/guides/${topic.slug}`}
							className="text-secondary hover:text-accent mb-3 inline-block text-sm"
						>
							<span aria-hidden>← </span>
							{topic.title}
						</Link>
					)}

					<h1 className="mb-3 text-4xl font-bold">{title}</h1>

					<div className="text-secondary flex gap-4 text-sm">
						{/* "Updated", never the publish date: these are maintained pages,
						    and an evergreen guide wearing a two-year-old publish date
						    reads as abandoned to both a visitor and a crawler. */}
						<time dateTime={updatedAtIso}>Updated {formattedUpdatedAt}</time>
						{readingTime && <span>{readingTime}</span>}
					</div>
				</>
			}
		>
			{children}
		</ProseShell>
	)
}
