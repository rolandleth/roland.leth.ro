import { prisma } from "@/lib/db/db"
import { revalidateGuideTopic } from "@/lib/db/guides"

/**
 * Busts the hub pages of the given topics, looked up by id.
 *
 * Every guide write needs this: a hub renders its guides' titles and
 * descriptions, so creating, editing, moving, or deleting a guide changes at
 * least one hub's list. The shared `guides` tag covers the `/guides` index and
 * the project pages, but a hub's detail page carries its own
 * `guide-topic-{slug}` tag and would otherwise serve a stale list.
 *
 * Takes ids because that's what a guide row carries, and resolves them to slugs
 * because that's what the cache tags are keyed on. Nulls and duplicates are
 * dropped, so callers can pass `[previousTopicId, nextTopicId]` on a move
 * without pre-filtering. No guide slugs are passed through to
 * `revalidateGuideTopic`: this path doesn't change any guide's parent link, only
 * the hub's own list.
 */
export async function revalidateTopicsById(
	topicIds: readonly (number | null)[]
): Promise<void> {
	const ids = [...new Set(topicIds.filter((id) => id != null))]

	if (ids.length === 0) {
		return
	}

	const topics = await prisma.guideTopic.findMany({
		where: { id: { in: ids } },
		select: { slug: true },
	})

	for (const topic of topics) {
		revalidateGuideTopic(topic.slug)
	}
}
