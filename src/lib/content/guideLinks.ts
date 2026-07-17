// Row → link-entry mapping for every surface that lists guides (`/guides`, a
// topic hub, a project page's guides section). Pure and I/O-free so the three
// surfaces share one answer to "what does a topic look like next to a guide"
// instead of each mapping rows inline and drifting.

import type {
	GuideListItem,
	GuideTopicWithGuides,
	GuidesOverview,
} from "@/lib/db/guides"

export interface GuideLinkItem {
	slug: string
	title: string
	description: string
	/** A short muted hint: reading time for a guide, guide count for a topic. */
	meta?: string
}

export function guideToLinkItem(guide: GuideListItem): GuideLinkItem {
	return {
		slug: guide.slug,
		title: guide.title,
		description: guide.description,
		meta: guide.readingTime ?? undefined,
	}
}

/**
 * A topic renders as an entry like any guide — same URL shape, same card. The
 * guide count is the one honest signal that clicking it leads to a hub rather
 * than an article, so it takes the slot a guide uses for reading time.
 */
export function topicToLinkItem(topic: GuideTopicWithGuides): GuideLinkItem {
	return {
		slug: topic.slug,
		title: topic.title,
		description: topic.shortDescription,
		meta: guideCountLabel(topic.guides.length),
	}
}

/** Omitted rather than "0 guides" — an empty hub shouldn't advertise its emptiness. */
function guideCountLabel(count: number): string | undefined {
	if (count === 0) {
		return undefined
	}

	return count === 1 ? "1 guide" : `${count} guides`
}

/**
 * Topics first, then ungrouped guides — the order `/guides` and every project
 * page's guides section share. Within each group the DB ordering (sortOrder,
 * then title) already applies.
 */
export function overviewToLinkItems(overview: GuidesOverview): GuideLinkItem[] {
	return [
		...overview.topics.map(topicToLinkItem),
		...overview.ungrouped.map(guideToLinkItem),
	]
}
