import Link from "next/link"
import { notFound } from "next/navigation"
import { buildPageMetadata } from "@/lib/content/metadata"
import { getPostsGroupedByYear } from "@/lib/db/posts"
import { capitalizeSection, isValidSection, SECTIONS } from "@/lib/db/sections"
import { formatDate } from "@/lib/utils/format"
import type { Metadata } from "next"

export function generateStaticParams() {
	return SECTIONS.map((section) => ({ section }))
}

interface Props {
	params: Promise<{ section: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { section } = await params

	if (!isValidSection(section)) {
		return {}
	}

	const label = capitalizeSection(section)

	return buildPageMetadata({
		title: `${label} archive`,
		description: `All ${section} posts, grouped by year.`,
		path: `/blog/${section}/archive`,
		feedPath: `/blog/${section}/feed.xml`,
	})
}

export default async function ArchivePage({ params }: Props) {
	const { section } = await params

	if (!isValidSection(section)) {
		notFound()
	}

	const grouped = await getPostsGroupedByYear(section)
	const years = Object.keys(grouped).sort((a, b) => Number(b) - Number(a))

	return (
		<div className="mx-auto max-w-4xl px-4 py-12">
			<h1 className="mb-8 text-3xl font-bold">Archive</h1>

			{years.length === 0 ? (
				<p className="text-(--color-secondary)">No posts yet.</p>
			) : (
				<div className="space-y-10">
					{years.map((year) => (
						<section key={year}>
							<h2 className="border-border mb-3 border-l-2 pl-3 text-xl font-semibold">
								{year}
							</h2>

							<ul className="divide-border divide-y">
								{grouped[year].map((post) => (
									<li key={post.slug} className="py-3">
										<Link
											href={`/blog/${post.section}/${post.slug}`}
											className="group flex items-baseline justify-between gap-4"
										>
											<span className="font-medium transition-colors duration-300 group-hover:text-(--color-accent)">
												{post.title}
											</span>
											<span className="shrink-0 text-sm text-(--color-secondary)">
												{formatDate(post.datetime)}
											</span>
										</Link>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			)}
		</div>
	)
}
