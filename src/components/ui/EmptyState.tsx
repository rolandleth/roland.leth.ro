import type { ReactNode } from "react"

interface Props {
	symbol: ReactNode
	title: string
	description?: ReactNode
	action?: ReactNode
}

export default function EmptyState({
	symbol,
	title,
	description,
	action,
}: Props) {
	return (
		<div className="flex flex-col items-center py-16 text-center">
			<p
				aria-hidden
				className="text-[9rem] leading-none font-bold text-(--color-accent) opacity-10 select-none"
			>
				{symbol}
			</p>

			<h2 className="-mt-4 text-3xl font-bold">{title}</h2>

			{description && (
				<p className="text-secondary mt-3 max-w-xs leading-relaxed">
					{description}
				</p>
			)}

			{action && <div className="mt-10">{action}</div>}
		</div>
	)
}
