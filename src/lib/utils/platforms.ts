import { PlatformBucket, PlatformTag } from "@/generated/prisma/client"

// Display label for each bucket. Identifiers come from Postgres (no spaces),
// labels are what we render.
const BUCKET_LABELS: Record<PlatformBucket, string> = {
	iOS: "iOS",
	Mac: "Mac",
	Web: "Web",
	OpenSource: "Open Source",
}

// Display label for each tag. Mostly identity, but a couple of tags want
// renaming for presentation: `MenuBar` → "Menu bar", `Next` → "Next.js".
export const TAG_LABELS: Record<PlatformTag, string> = {
	iOS: "iOS",
	iPad: "iPad",
	watchOS: "watchOS",
	Android: "Android",
	macOS: "macOS",
	MenuBar: "Menu bar",
	Frontend: "Frontend",
	Backend: "Backend",
	React: "React",
	Next: "Next.js",
	Node: "Node",
	Vapor: "Vapor",
	Library: "Library",
	CLI: "CLI",
	SDK: "SDK",
	Package: "Package",
	Plugin: "Plugin",
	Script: "Script",
	Extension: "Extension",
}

// Canonical gallery order. Matches the previous `BUCKET_ORDER` so the
// gallery still renders iOS → Mac → Web → Open Source.
const BUCKET_ORDER: PlatformBucket[] = ["iOS", "Mac", "Web", "OpenSource"]

// The tags that "belong to" each bucket — i.e. tags whose presence doesn't
// push the compact label into "Multiplatform" territory. iOS+iPad is still
// "iOS" on the list; iOS+Android is "Multiplatform" because Android is
// outside iOS's natural set. OpenSource's natural set is just the OSS-flavor
// descriptors — anything else (e.g. tagging an OSS project with iOS too)
// signals cross-cutting and surfaces as "Multiplatform" on lists.
const BUCKET_NATURAL_TAGS: Record<PlatformBucket, ReadonlySet<PlatformTag>> = {
	iOS: new Set([PlatformTag.iOS, PlatformTag.iPad, PlatformTag.watchOS]),
	Mac: new Set([PlatformTag.macOS, PlatformTag.MenuBar]),
	Web: new Set([
		PlatformTag.Frontend,
		PlatformTag.Backend,
		PlatformTag.React,
		PlatformTag.Next,
		PlatformTag.Node,
		PlatformTag.Vapor,
	]),
	OpenSource: new Set([
		PlatformTag.Library,
		PlatformTag.CLI,
		PlatformTag.SDK,
		PlatformTag.Package,
		PlatformTag.Plugin,
		PlatformTag.Script,
		PlatformTag.Extension,
	]),
}

// Tags surfaced as chip suggestions in the admin picker per bucket. Differs
// from `BUCKET_NATURAL_TAGS` only for OpenSource: an OSS project might also
// want iOS / Web platform tags (e.g. an iOS library tagged `[Library, iOS]`),
// so the picker offers every tag when bucket=OpenSource. The other three
// buckets stay scoped to their natural set.
export const BUCKET_SUGGESTED_TAGS: Record<PlatformBucket, PlatformTag[]> = {
	iOS: [...BUCKET_NATURAL_TAGS.iOS],
	Mac: [...BUCKET_NATURAL_TAGS.Mac],
	Web: [...BUCKET_NATURAL_TAGS.Web],
	OpenSource: Object.values(PlatformTag),
}

export function bucketLabel(bucket: PlatformBucket): string {
	return BUCKET_LABELS[bucket]
}

export function tagLabel(tag: PlatformTag): string {
	return TAG_LABELS[tag]
}

/**
 * List-view label that fits the tiny capsule under a project's icon. Rules:
 * - 0 tags → bucket label (the bucket is the only signal we have)
 * - 1 tag → that tag's label
 * - Web + Frontend + Backend → "Fullstack" (the one editorial alias worth keeping)
 * - 2+ tags all within the bucket's natural set → bucket label
 * - 2+ tags spanning the bucket's natural set → "Multiplatform"
 */
export function compactLabel(
	bucket: PlatformBucket,
	tags: PlatformTag[]
): string {
	if (tags.length === 0) {
		return bucketLabel(bucket)
	}

	if (tags.length === 1) {
		return tagLabel(tags[0])
	}

	if (
		bucket === PlatformBucket.Web &&
		tags.includes(PlatformTag.Frontend) &&
		tags.includes(PlatformTag.Backend)
	) {
		return "Fullstack"
	}

	const natural = BUCKET_NATURAL_TAGS[bucket]
	const isAllNatural = tags.every((t) => natural.has(t))

	if (isAllNatural) {
		return bucketLabel(bucket)
	}

	return "Multiplatform"
}

/**
 * Detail-view label — the honest, full stack. Rendered exactly once on the
 * project detail page where there's room for it. Empty tag arrays fall back
 * to the bucket label so the page never shows an empty pill.
 */
export function detailLabel(
	bucket: PlatformBucket,
	tags: PlatformTag[]
): string {
	if (tags.length === 0) {
		return bucketLabel(bucket)
	}

	return tags.map(tagLabel).join(" + ")
}

/**
 * Returns true when the compact label adds no information beyond the
 * gallery section header. The capsule under the icon is hidden in that case
 * to avoid duplicating the header. Multi-tag labels ("Fullstack",
 * "Multiplatform") are always informative and never redundant.
 */
export function isCompactLabelRedundant(
	bucket: PlatformBucket,
	tags: PlatformTag[]
): boolean {
	return compactLabel(bucket, tags) === bucketLabel(bucket)
}

/**
 * Groups projects by bucket and returns them in canonical gallery order.
 * Empty buckets are omitted so the gallery doesn't render empty sections.
 */
export function groupByBucket<T extends { bucket: PlatformBucket }>(
	projects: T[]
): { bucket: PlatformBucket; label: string; projects: T[] }[] {
	const groups = new Map<PlatformBucket, T[]>()

	for (const project of projects) {
		const existing = groups.get(project.bucket)

		if (existing) {
			existing.push(project)
			continue
		}

		groups.set(project.bucket, [project])
	}

	return BUCKET_ORDER.filter((bucket) => groups.has(bucket)).map((bucket) => ({
		bucket,
		label: bucketLabel(bucket),
		projects: groups.get(bucket) ?? [],
	}))
}
