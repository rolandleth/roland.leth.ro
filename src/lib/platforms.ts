const frontendKeywords = ["React", "Next", "Frontend"]
const backendKeywords = ["Node", "Backend", "Vapor"]

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

function lowerSet(values: string[]): Set<string> {
	return new Set(values.map((value) => value.toLowerCase()))
}

const BUCKET_KEYWORDS: Record<string, Set<string>> = Object.fromEntries(
	PLATFORM_BUCKETS.map((bucket) => [bucket.label, lowerSet(bucket.keywords)])
)

const FRONTEND_KEYWORDS_LOWER = lowerSet(frontendKeywords)
const BACKEND_KEYWORDS_LOWER = lowerSet(backendKeywords)

const OTHER_BUCKET_LABEL = "Other"
const BUCKET_ORDER = [
	...PLATFORM_BUCKETS.map((bucket) => bucket.label),
	OTHER_BUCKET_LABEL,
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
	// "Mac" section covers both "macOS" alone and "macOS, Menu bar"; the capsule would duplicate the header in both cases.
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
	if (!platform.includes(",")) {
		return platform
	}

	const keywords = platform.split(",").map((s) => s.trim().toLowerCase())

	const webBucket = BUCKET_KEYWORDS["Web"]

	if (
		webBucket &&
		keywords.every((kw) => webBucket.has(kw)) &&
		keywords.some((kw) => FRONTEND_KEYWORDS_LOWER.has(kw)) &&
		keywords.some((kw) => BACKEND_KEYWORDS_LOWER.has(kw))
	) {
		return "Fullstack"
	}

	const macBucket = BUCKET_KEYWORDS["Mac"]

	if (macBucket && keywords.every((kw) => macBucket.has(kw))) {
		return platform
	}

	const iosBucket = BUCKET_KEYWORDS["iOS"]

	// iOS-only multi-keyword strings (e.g. "iOS, watchOS") still render as the original value; anything touching Android is multiplatform.
	if (
		iosBucket &&
		keywords.every((kw) => iosBucket.has(kw)) &&
		!keywords.includes("android")
	) {
		return platform
	}

	return "Multiplatform"
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Word-boundary match per keyword so `"webhook"` never matches the `"web"`
// keyword (substring false positive), while `"menu bar app"` still maps to the
// `"menu bar"` keyword. `\b` aligns at word/non-word transitions so multi-word
// keywords still match when surrounded by whitespace or punctuation.
function hasKeyword(haystack: string, keyword: string): boolean {
	return new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i").test(haystack)
}

/** Returns the first bucket label that any keyword in `platform` matches, or "Other". */
export function platformBucket(platform: string): string {
	for (const bucket of PLATFORM_BUCKETS) {
		const keywords = BUCKET_KEYWORDS[bucket.label]

		for (const keyword of keywords) {
			if (hasKeyword(platform, keyword)) {
				return bucket.label
			}
		}
	}

	return OTHER_BUCKET_LABEL
}

export function groupByPlatform<T extends { platform: string }>(
	projects: T[]
): { label: string; projects: T[] }[] {
	const buckets = new Map<string, T[]>()

	for (const project of projects) {
		const label = platformBucket(project.platform)
		const existing = buckets.get(label)

		if (existing) {
			existing.push(project)
			continue
		}

		buckets.set(label, [project])
	}

	return BUCKET_ORDER.filter((label) => buckets.has(label)).map((label) => ({
		label,
		projects: buckets.get(label) ?? [],
	}))
}
