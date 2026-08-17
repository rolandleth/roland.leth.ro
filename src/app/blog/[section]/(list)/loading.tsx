import PageGlow from "@/components/PageGlow"

// The `(list)` group exists for this file, and moving either one out of it
// breaks `/blog/:section/:slug` and `/blog/:section/p/:page` silently.
//
// `loading.tsx` wraps its segment's `children`, and `children` means every route
// nested below it — so at `blog/[section]/` this skeleton also wrapped the post
// page and the pagination pages. The Suspense boundary it creates is what lets
// React commit a 200 and stream the shell before the page resolves, and a status
// can't be revised after the first byte. `notFound()` firing later then only
// swaps the boundary's content: the 404 page renders, the response stays 200,
// and crawlers index every guessed slug as a real page. Measured in production
// on 2026-08-17.
//
// A route group adds no URL segment, so `/blog/:section` is unchanged while the
// boundary now covers exactly one page. `src/app/blog/loadingBoundaries.test.ts`
// fails if a `loading.tsx` reappears above any of the affected routes.

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
