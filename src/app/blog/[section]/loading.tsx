import PageGlow from "@/components/PageGlow"

function PostCardSkeleton() {
	return (
		<div className="animate-pulse py-8">
			<div className="bg-border mb-2 h-7 w-2/3 rounded" />
			<div className="mb-4 flex gap-4">
				<div className="bg-border h-4 w-24 rounded" />
				<div className="bg-border h-4 w-16 rounded" />
			</div>
			<div className="space-y-2">
				<div className="bg-border h-4 w-full rounded" />
				<div className="bg-border h-4 w-full rounded" />
				<div className="bg-border h-4 w-4/5 rounded" />
			</div>
		</div>
	)
}

export default function BlogListLoading() {
	return (
		<div className="relative mx-auto w-full max-w-3xl px-4 py-12">
			<PageGlow />
			<div className="mb-2 flex h-10 items-center">
				<div className="bg-border h-8 w-24 animate-pulse rounded" />
			</div>
			<div className="divide-border divide-y">
				{Array.from({ length: 5 }).map((_, i) => (
					<PostCardSkeleton key={i} />
				))}
			</div>
		</div>
	)
}
