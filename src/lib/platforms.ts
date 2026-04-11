// Platform bucket labels and their match keywords
export const PLATFORM_BUCKETS: { label: string; keywords: string[] }[] = [
	{ label: "iOS", keywords: ["ios", "android", "ipad"] },
	{ label: "Mac", keywords: ["mac", "menu bar"] },
	{ label: "Web", keywords: ["web", "react", "next", "node"] },
	{
		label: "Open Source",
		keywords: ["cli", "lib", "sdk", "package", "plugin", "script", "extension"],
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
	if (platform.includes(",")) {
		return false
	}

	const p = platform.trim().toLowerCase()
	const s = sectionLabel.trim().toLowerCase()

	return p === s || p.startsWith(s) || s.startsWith(p)
}

export function platformBucket(platform: string): string {
	const lower = platform.toLowerCase()

	for (const bucket of PLATFORM_BUCKETS) {
		if (bucket.keywords.some((kw) => lower.includes(kw))) {
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
