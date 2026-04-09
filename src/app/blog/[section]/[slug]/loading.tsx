import PageGlow from "@/components/PageGlow"

export default function PostLoading() {
	return (
		<>
			<PageGlow />
			<article className="mx-auto w-full max-w-3xl px-4 py-12">
				<header className="mb-10 animate-pulse">
					<div className="bg-border mb-2 h-10 w-4/5 rounded" />
					<div className="bg-border h-10 w-2/5 rounded" />
					<div className="mt-3 flex gap-4">
						<div className="bg-border h-4 w-24 rounded" />
						<div className="bg-border h-4 w-16 rounded" />
					</div>
				</header>

				<div className="animate-pulse space-y-3">
					<div className="bg-border h-4 w-full rounded" />
					<div className="bg-border h-4 w-full rounded" />
					<div className="bg-border h-4 w-3/4 rounded" />
					<div className="bg-border h-4 w-full rounded" />
					<div className="bg-border h-4 w-5/6 rounded" />
					<div className="mt-6 mb-2">
						<div className="bg-border h-6 w-48 rounded" />
					</div>
					<div className="bg-border h-4 w-full rounded" />
					<div className="bg-border h-4 w-full rounded" />
					<div className="bg-border h-4 w-2/3 rounded" />
					<div className="bg-border h-4 w-full rounded" />
					<div className="bg-border h-4 w-4/5 rounded" />
					<div className="bg-border h-4 w-full rounded" />
				</div>
			</article>
		</>
	)
}
