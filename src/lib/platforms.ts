const frontendKeywords = ["React", "Next", "Frontend"]
const backendKeywords = ["Node", "Backend", "Vapor"]

// Platform bucket labels and their match keywords
export const PLATFORM_BUCKETS: { label: string; keywords: string[] }[] = [
	{ label: "iOS", keywords: ["iOS", "iPad", "watchOS", "Android"] },
	{ label: "Mac", keywords: ["macOS", "Menu bar"] },
	{
		label: "Web",
		keywords: [...frontendKeywords, ...backendKeywords],
	},
	{
		label: "Open Source",
		keywords: [
			"CLI",
			"lib",
			"SDK",
			"Package",
			"Plugin",
			"Script",
			"Extension",
			"Web",
		],
	},
]

/**
 * Returns true when the platform label adds no information beyond the section header.
 * Hides the capsule for exact matches ("iOS" → "iOS") and prefix aliases ("macOS" → "Mac").
 * Always shows for multi-platform values ("iOS, Android").
 */
export function isPlatformRedundantWithSection(
	platform: string,
	sectionLabel: string
): boolean {
	// The "Mac" section can be either standalone "macOS", or contain "Menu bar" as a secondary keyword. In either case, the platform label adds no information beyond the section header, so we hide it.
	if (sectionLabel === "Mac") {
		return true
	}

	if (platform.includes(",")) {
		return false
	}

	const p = platform.trim().toLowerCase()
	const s = sectionLabel.trim().toLowerCase()

	return p === s || p.startsWith(s) || s.startsWith(p)
}

/**
 * Returns the display label for a platform string.
 * Multiple web keywords → "Fullstack"; any other multi-keyword value → "Multiplatform".
 */
export function formatPlatformDisplay(platform: string): string {
	// If it's a single keyword, just return it.
	if (!platform.includes(",")) {
		return platform
	}

	const keywords = platform.split(",").map((s) => s.trim().toLowerCase())
	const webBucket = PLATFORM_BUCKETS.find(
		(b) => b.label.toLowerCase() === "web"
	)?.keywords.map((k) => k.toLowerCase())

	// If all keywords match the Web bucket and there's at least one frontend and one backend keyword, it's most likely a fullstack web project rather than a generic multi-platform project.
	if (
		webBucket &&
		keywords.every((kw) => webBucket.includes(kw)) &&
		keywords.some((kw) =>
			frontendKeywords.map((k) => k.toLowerCase()).includes(kw)
		) &&
		keywords.some((kw) =>
			backendKeywords.map((k) => k.toLowerCase()).includes(kw)
		)
	) {
		return "Fullstack"
	}

	const macBucket = PLATFORM_BUCKETS.find(
		(b) => b.label.toLowerCase() === "mac"
	)?.keywords.map((k) => k.toLowerCase())

	// If all keywords match the Mac bucket, it's most likely a macOS app with a menu bar component.
	if (macBucket && keywords.every((kw) => macBucket.includes(kw))) {
		return platform
	}

	const iosBucket = PLATFORM_BUCKETS.find(
		(b) => b.label.toLowerCase() === "ios"
	)?.keywords.map((k) => k.toLowerCase())

	// If all keywords match the iOS bucket, but don't include "Android", it's an iOS app that also supports watchOS and/or iPad, but not a generic multi-platform project.
	if (
		iosBucket &&
		keywords.every((kw) => iosBucket.includes(kw)) &&
		!keywords.includes("android")
	) {
		return platform
	}

	// Otherwise, it's a generic multi-platform project.
	return "Multiplatform"
}

// Returns the first bucket label for a given platform string, or "Other" if no match is found.
// Order is: iOS → Mac → Web → Open Source → Other
export function platformBucket(platform: string): string {
	const lower = platform.toLowerCase()

	for (const bucket of PLATFORM_BUCKETS) {
		if (
			bucket.keywords
				.map((k) => k.toLowerCase())
				.some((kw) => lower.includes(kw))
		) {
			return bucket.label
		}
	}

	return "Other"
}

export function groupByPlatform<T extends { platform: string }>(
	projects: T[]
): { label: string; projects: T[] }[] {
	const buckets = new Map<string, T[]>()

	for (const project of projects) {
		const label = platformBucket(project.platform)
		const existing = buckets.get(label) ?? []
		buckets.set(label, [...existing, project])
	}

	// Preserve canonical order: Mobile → Mac → Web → Open Source → Other
	const order = ["iOS", "Mac", "Web", "Open Source", "Other"]

	return order
		.filter((label) => buckets.has(label))
		.map((label) => ({ label, projects: buckets.get(label) ?? [] }))
}
