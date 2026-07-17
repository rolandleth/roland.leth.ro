// Write-path integrity rules for guides and topics — the checks Postgres can't
// express for us. Next-free (prisma only, no `next/cache`) so `scripts/
// import-guides.ts` and the admin API routes enforce one set of rules instead
// of each growing its own; `guides.ts` re-exports `findSlugOwner` to keep the
// established `@/lib/db/guides` import surface intact. Same split, same reason,
// as `projectMappers.ts` vs `projects.ts`.

import { prisma } from "@/lib/db/db"

export type SlugOwner = "guide" | "topic"

/**
 * Which table already holds `slug`, or null when it's free.
 *
 * Guides and topics share one flat `/guides/:slug` namespace across two tables,
 * and Postgres has no cross-table unique constraint — so this is the
 * enforcement point for every write path.
 *
 * `ignore` excludes the row being updated, so re-saving a guide without
 * touching its slug doesn't collide with itself.
 *
 * Inherently racy: two concurrent creates can both see a free slug. The
 * per-table `@@unique` still catches the same-table case (surfacing as a 409);
 * only a simultaneous guide-and-topic create of the same slug slips through,
 * which takes a single admin racing themselves across two tabs. Not worth an
 * advisory lock at single-author volume.
 */
export async function findSlugOwner(
	slug: string,
	ignore?: { kind: SlugOwner; id: number }
): Promise<SlugOwner | null> {
	const [guide, topic] = await Promise.all([
		prisma.guide.findUnique({ where: { slug }, select: { id: true } }),
		prisma.guideTopic.findUnique({ where: { slug }, select: { id: true } }),
	])

	if (guide != null && !(ignore?.kind === "guide" && ignore.id === guide.id)) {
		return "guide"
	}

	if (topic != null && !(ignore?.kind === "topic" && ignore.id === topic.id)) {
		return "topic"
	}

	return null
}

/**
 * Validates a guide's outward references, returning a human-readable problem or
 * null when they're sound. Callers pass the *effective* values — for a partial
 * update that means `payload ?? persisted`, never just the payload, or a PUT
 * that patches only `topicId` would skip the coherence check against the row's
 * existing project. (That gap is a live watch-out on the projects PUT; not
 * repeating it here.)
 *
 * The rules:
 *  - a named project must exist (`projectSlug` is a slug reference, not an FK,
 *    so nothing else enforces this);
 *  - a named topic must exist;
 *  - a grouped guide must belong to the same project as its topic — both null
 *    is fine, one-sided is not. Otherwise a Reckon guide could sit under a
 *    Continuum hub and be listed on both products' pages.
 */
export async function describeGuideRefProblem({
	projectSlug,
	topicId,
}: {
	projectSlug: string | null
	topicId: number | null
}): Promise<string | null> {
	const [project, topic] = await Promise.all([
		projectSlug == null
			? null
			: prisma.project.findUnique({
					where: { slug: projectSlug },
					select: { slug: true },
				}),
		topicId == null
			? null
			: prisma.guideTopic.findUnique({
					where: { id: topicId },
					select: { projectSlug: true },
				}),
	])

	if (projectSlug != null && project == null) {
		return `Unknown project: ${projectSlug}`
	}

	if (topicId != null && topic == null) {
		return `Unknown topic: ${topicId}`
	}

	if (topic != null && topic.projectSlug !== projectSlug) {
		return `A guide's project (${projectSlug ?? "none"}) must match its topic's project (${topic.projectSlug ?? "none"})`
	}

	return null
}

/**
 * Validates a topic's project reference. Topics carry no topic of their own, so
 * this is only the existence check — but it's the same slug-not-FK reference,
 * so it needs the same enforcement.
 */
export async function describeTopicRefProblem({
	projectSlug,
}: {
	projectSlug: string | null
}): Promise<string | null> {
	if (projectSlug == null) {
		return null
	}

	const project = await prisma.project.findUnique({
		where: { slug: projectSlug },
		select: { slug: true },
	})

	return project == null ? `Unknown project: ${projectSlug}` : null
}
