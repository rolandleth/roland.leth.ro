import GuideLinkList from "@/components/guides/GuideLinkList"
import PageGlow from "@/components/PageGlow"
import EmptyState from "@/components/ui/EmptyState"
import { overviewToLinkItems } from "@/lib/content/guideLinks"
import { buildPageMetadata } from "@/lib/content/metadata"
import { getGuidesOverview } from "@/lib/db/guides"
import type { Metadata } from "next"

const DESCRIPTION =
	"Reference guides I keep up to date, on the problems my apps are built around."

export const metadata: Metadata = buildPageMetadata({
	title: "Guides",
	description: DESCRIPTION,
	path: "/guides",
	canonicalPath: "/guides",
})

/**
 * The `/guides` index. Deliberately not in the header nav — guides are reached
 * by search, by direct link, and from the project pages they support; this page
 * and the footer link to it are the discoverability floor, not the front door.
 *
 * A static route, so it wins over the `[slug]` legacy catch-all with no conflict.
 */
export default async function GuidesPage() {
	const overview = await getGuidesOverview()
	const items = overviewToLinkItems(overview)

	return (
		<>
			<PageGlow />

			<div className="mx-auto w-full max-w-3xl px-4 py-12">
				<h1 className="mb-3 text-4xl font-bold text-pretty">Guides</h1>
				<p className="text-secondary mb-10">{DESCRIPTION}</p>

				{items.length === 0 ? (
					<EmptyState symbol="?" title="Nothing here yet" />
				) : (
					<GuideLinkList items={items} />
				)}
			</div>
		</>
	)
}
