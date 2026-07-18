import { prisma } from "@/lib/db/db"
import { revalidateGuide, revalidateGuideTopic } from "@/lib/db/guides"

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
 *
 * Returns the number of hubs actually busted, and warns when a requested id
 * resolves to no row (a stale topic reference — e.g. a hub deleted between the
 * caller's read and this bust) so the drift is visible instead of a silent
 * short bust.
 */
export async function revalidateTopicsById(
	topicIds: readonly (number | null)[]
): Promise<number> {
	const ids = [...new Set(topicIds.filter((id) => id != null))]

	if (ids.length === 0) {
		return 0
	}

	const topics = await prisma.guideTopic.findMany({
		where: { id: { in: ids } },
		select: { slug: true },
	})

	for (const topic of topics) {
		revalidateGuideTopic(topic.slug)
	}

	if (topics.length < ids.length) {
		// eslint-disable-next-line no-console
		console.warn(
			`[guideRevalidation] ${ids.length - topics.length} topic id(s) did not resolve to a hub`,
			{ requested: ids.length, resolved: topics.length }
		)
	}

	return topics.length
}

/**
 * Busts a batch of pasted guide/topic slugs for the admin RevalidatePanel after
 * a direct-Prisma script import. For each slug it busts that slug's own detail
 * page (guide and topic tags both — the panel can't tell which kind a slug is,
 * and the wrong one is a cheap no-op) plus the shared aggregates, then resolves
 * the parent topic hub of every slug that turns out to be a guide and busts that
 * too: a hub lists its guides' titles and descriptions, so a script edit to a
 * guide's body would otherwise leave the hub's list stale. This is the panel's
 * equivalent of the `revalidateTopicsById` call the admin write routes make,
 * which have the `topicId` in hand and the panel does not.
 *
 * Returns the slugs that matched a guide row, so the caller (and tests) can see
 * how many parent hubs were resolvable — an unmatched slug (a typo, or a topic
 * slug) resolves no parent.
 */
export async function revalidateGuideSlugs(
	slugs: readonly string[]
): Promise<string[]> {
	for (const slug of slugs) {
		revalidateGuide(slug)
		revalidateGuideTopic(slug)
	}

	const guides = await prisma.guide.findMany({
		where: { slug: { in: [...slugs] } },
		select: { slug: true, topicId: true },
	})

	await revalidateTopicsById(guides.map((guide) => guide.topicId))

	return guides.map((guide) => guide.slug)
}
