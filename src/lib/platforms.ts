// Platform bucket labels and their match keywords
export const PLATFORM_BUCKETS: { label: string; keywords: string[] }[] = [
	{ label: "Mobile", keywords: ["ios", "android", "mobile", "iphone", "ipad"] },
	{ label: "Mac", keywords: ["mac", "macos", "desktop"] },
	{ label: "Web", keywords: ["web", "website", "react", "next"] },
]

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

	// Preserve canonical order: Mobile → Mac → Web → Other
	const order = ["Mobile", "Mac", "Web", "Other"]

	return order
		.filter((label) => buckets.has(label))
		.map((label) => ({ label, projects: buckets.get(label) ?? [] }))
}
