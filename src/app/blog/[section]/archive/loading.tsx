export default function ArchiveLoading() {
	return (
		<main className="mx-auto max-w-4xl px-4 py-12">
			<div className="bg-border mb-8 h-8 w-24 animate-pulse rounded" />

			<div className="space-y-10">
				{Array.from({ length: 3 }).map((_, yi) => (
					<section key={yi}>
						<div className="bg-border mb-3 h-6 w-12 animate-pulse rounded" />
						<div className="divide-border divide-y">
							{Array.from({ length: yi === 0 ? 6 : 4 }).map((_, i) => (
								<div
									key={i}
									className="flex items-baseline justify-between gap-4 py-3"
								>
									<div
										className="bg-border h-4 animate-pulse rounded"
										style={{ width: `${45 + ((i * 17 + yi * 11) % 35)}%` }}
									/>
									<div className="bg-border h-4 w-20 shrink-0 animate-pulse rounded" />
								</div>
							))}
						</div>
					</section>
				))}
			</div>
		</main>
	)
}
