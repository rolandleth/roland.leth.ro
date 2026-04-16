import Link from "next/link"
import { notFound } from "next/navigation"
import SearchForm from "@/components/blog/SearchForm"
import EmptyState from "@/components/ui/EmptyState"
import { formatDate } from "@/lib/format"
import { buildPageMetadata } from "@/lib/metadata"
import { searchPosts } from "@/lib/posts"
import { capitalizeSection, isValidSection } from "@/lib/sections"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ section: string }>
	searchParams: Promise<{ q?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { section } = await params

	if (!isValidSection(section)) {
		return {}
	}

	const label = capitalizeSection(section)

	return buildPageMetadata({
		title: `Search ${label}`,
		description: `Search ${section} posts.`,
		path: `/blog/${section}/search`,
	})
}

export default async function SearchPage({ params, searchParams }: Props) {
	const { section } = await params
	const { q } = await searchParams

	if (!isValidSection(section)) {
		notFound()
	}

	const query = q?.trim() ?? ""
	const results = query.length > 0 ? await searchPosts(section, query) : []

	return (
		<main className="mx-auto w-full max-w-3xl px-4 py-12">
			<div className="mb-10">
				<SearchForm
					section={section}
					defaultValue={query}
					placeholder="Search…"
				/>
			</div>

			{query.length > 0 && (
				<div className="mt-8">
					{results.length === 0 ? (
						<EmptyState
							symbol="?"
							title="Nothing found"
							description={
								<>No posts match &ldquo;{query}&rdquo;. Try a different term.</>
							}
						/>
					) : (
						<ul className="divide-border divide-y">
							{results.map((post) => (
								<li key={post.slug} className="py-4">
									<Link
										href={`/blog/${post.section}/${post.slug}`}
										className="group block"
									>
										<h2 className="font-medium transition-colors duration-300 group-hover:text-(--color-accent)">
											{post.title}
										</h2>

										<div className="mt-1 flex gap-3 text-sm text-(--color-secondary)">
											<span>{formatDate(post.datetime)}</span>
											{post.readingTime && (
												<>
													<span aria-hidden>·</span>
													<span>{post.readingTime}</span>
												</>
											)}
										</div>
									</Link>
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</main>
	)
}
