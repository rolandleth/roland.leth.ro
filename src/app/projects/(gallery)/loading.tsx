import PageGlow from "@/components/PageGlow"

// The `(gallery)` group exists for this file — see the same note on
// `blog/[section]/(list)/loading.tsx`. At `projects/` this skeleton also wrapped
// `/projects/:slug`, whose Suspense boundary made `notFound()` serve the 404
// page with a 200 status. The group scopes it to the gallery page alone, leaving
// the detail route free to return a real 404.

function FeaturedCardSkeleton() {
	return (
		<div className="animate-pulse overflow-hidden rounded-2xl border border-(--color-border)">
			<div className="bg-border aspect-video w-full" />
			<div className="flex flex-col gap-3 p-5">
				<div className="flex items-start gap-3">
					<div className="bg-border h-11 w-11 shrink-0 rounded-xl" />
					<div className="flex-1 space-y-2">
						<div className="bg-border h-5 w-1/2 rounded" />
						<div className="bg-border h-4 w-1/4 rounded-full" />
					</div>
				</div>
				<div className="space-y-2">
					<div className="bg-border h-4 w-full rounded" />
					<div className="bg-border h-4 w-full rounded" />
					<div className="bg-border h-4 w-3/5 rounded" />
				</div>
			</div>
		</div>
	)
}

function CompactCardSkeleton() {
	return (
		<div className="flex animate-pulse flex-col items-center gap-2.5 p-3">
			<div className="bg-border h-16 w-16 rounded-2xl" />
			<div className="bg-border h-3 w-12 rounded" />
		</div>
	)
}

export default function ProjectsLoading() {
	return (
		<div className="relative mx-auto max-w-5xl px-4 py-12">
			<PageGlow />

			<div className="mb-10">
				<div className="bg-border h-8 w-28 animate-pulse rounded" />
			</div>

			<section className="mb-16">
				<div className="bg-border mb-6 h-3 w-20 animate-pulse rounded" />
				<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
					<FeaturedCardSkeleton />
					<FeaturedCardSkeleton />
				</div>
			</section>

			<section className="mb-12">
				<div className="bg-border mb-5 h-3 w-16 animate-pulse rounded" />
				<div className="grid grid-cols-4 gap-1 sm:grid-cols-6 md:grid-cols-8">
					{Array.from({ length: 8 }).map((_, i) => (
						<CompactCardSkeleton key={i} />
					))}
				</div>
			</section>
		</div>
	)
}
