import type { Section } from "@/lib/db/sections"

export type LegacyPostAlias = { section: Section; slug: string }

// Legacy post slugs the old blog's non-collapsing slugifier left behind (double
// or trailing dashes), mapped to the canonical slug `createSlug` now produces —
// the same renames `scripts/clean-legacy-slugs.ts` applies to the DB. Consulted
// ONLY on a catch-all / blog-route MISS to 308 an old URL to its clean form;
// it's an in-memory constant, never a DB read.
//
// Keep in lockstep with the DB rename: an entry whose target `slug` no longer
// exists just dead-ends at a canonical URL that itself 404s. These are a closed,
// historical set — new posts get clean slugs from `createSlug`, so this map
// shouldn't grow.
export const LEGACY_POST_SLUG_ALIASES: Record<string, LegacyPostAlias> = {
	"new-site-structure--again-": {
		section: "tech",
		slug: "new-site-structure-again",
	},
	"final-version--for-now-": {
		section: "tech",
		slug: "final-version-for-now",
	},
	"intro--slightly-more-details-about-me": {
		section: "life",
		slug: "intro-slightly-more-details-about-me",
	},
	"mm--yyyy-uipickerview": {
		section: "tech",
		slug: "mm-yyyy-uipickerview",
	},
	"formatters-": {
		section: "tech",
		slug: "formatters",
	},
	"fastlane-fastfile--2": {
		section: "tech",
		slug: "fastlane-fastfile-2",
	},
	"easier-hugging--compression-handling": {
		section: "tech",
		slug: "easier-hugging-compression-handling",
	},
}

/**
 * Resolves a legacy slug to its canonical section + slug, or null when it isn't
 * an aliased slug. Pure in-memory lookup.
 */
export function resolveLegacyPostAlias(slug: string): LegacyPostAlias | null {
	return LEGACY_POST_SLUG_ALIASES[slug] ?? null
}
