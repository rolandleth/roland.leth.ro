import Link from "next/link"
import type { GuideLinkItem } from "@/lib/content/guideLinks"

interface Props {
	items: readonly GuideLinkItem[]
	/**
	 * Heading level for each entry's title: 2 directly under the `/guides` or hub
	 * `<h1>`, 3 under a section `<h2>` on a project page. Passed explicitly rather
	 * than guessed, so a surface can't silently skip a level.
	 */
	headingLevel?: 2 | 3
}

/**
 * A list of links into the flat `/guides/:slug` namespace.
 *
 * Topics and guides share one component because they share one URL shape and
 * one entry shape — a topic is just an entry whose description is its
 * `shortDescription` and whose meta is a guide count. Callers map their rows
 * into `GuideLinkItem` instead of the component branching on which table a row
 * came from; that's what keeps regrouping a guide from ever changing its URL.
 */
export default function GuideLinkList({ items, headingLevel = 2 }: Props) {
	const Heading = `h${headingLevel}` as "h2" | "h3"

	return (
		<ul className="divide-border divide-y">
			{items.map((item) => (
				<li key={item.slug} className="py-5">
					<Heading className="text-primary mb-1 text-lg font-semibold">
						<Link href={`/guides/${item.slug}`} className="hover:text-accent">
							{item.title}
						</Link>
					</Heading>

					<p className="text-secondary text-sm">{item.description}</p>

					{item.meta && (
						<p className="text-secondary mt-2 text-xs">{item.meta}</p>
					)}
				</li>
			))}
		</ul>
	)
}
