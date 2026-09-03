"use client"

import ProseShell from "@/components/ui/ProseShell"
import { postDatetimeToISO } from "@/lib/utils/format"

interface Props {
	title: string
	formattedDate: string
	datetime: string
	readingTime: string | null
	children: React.ReactNode
}

export default function PostContent({
	title,
	formattedDate,
	datetime,
	readingTime,
	children,
}: Props) {
	return (
		<ProseShell
			header={
				<>
					<h1 className="mb-3 text-4xl font-bold text-pretty">{title}</h1>
					<div className="text-secondary flex gap-4 text-sm">
						<time dateTime={postDatetimeToISO(datetime)}>{formattedDate}</time>
						{readingTime && <span>{readingTime}</span>}
					</div>
				</>
			}
		>
			{children}
		</ProseShell>
	)
}
