export default function ProjectLoading() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-20">
			{/* Identity row */}
			<div className="mb-8 flex animate-pulse items-center justify-between gap-6">
				<div className="flex items-start gap-4">
					<div className="bg-border h-18 w-18 shrink-0 rounded-2xl" />
					<div className="space-y-2">
						<div className="bg-border h-8 w-40 rounded" />
						<div className="bg-border h-5 w-24 rounded-full" />
					</div>
				</div>
				<div className="bg-border h-8 w-24 shrink-0 rounded-full" />
			</div>

			{/* Summary */}
			<div className="mb-10 animate-pulse space-y-2">
				<div className="bg-border h-5 w-full rounded" />
				<div className="bg-border h-5 w-5/6 rounded" />
				<div className="bg-border h-5 w-3/4 rounded" />
			</div>

			{/* Section tabs */}
			<div className="animate-pulse">
				<div className="border-border flex gap-1 border-b pb-px">
					<div className="bg-border h-8 w-20 rounded-t" />
					<div className="bg-border h-8 w-20 rounded-t opacity-50" />
				</div>

				{/* Images carousel placeholder */}
				<div className="bg-border my-6 aspect-video w-full rounded-xl" />

				{/* Content */}
				<div className="space-y-3">
					<div className="bg-border h-4 w-full rounded" />
					<div className="bg-border h-4 w-full rounded" />
					<div className="bg-border h-4 w-11/12 rounded" />
					<div className="bg-border h-4 w-full rounded" />
					<div className="bg-border h-4 w-4/5 rounded" />
					<div className="mt-5 mb-2">
						<div className="bg-border h-5 w-44 rounded" />
					</div>
					<div className="bg-border h-4 w-full rounded" />
					<div className="bg-border h-4 w-full rounded" />
					<div className="bg-border h-4 w-2/3 rounded" />
				</div>
			</div>
		</div>
	)
}
