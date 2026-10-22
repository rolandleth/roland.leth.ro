import type { IsoDay } from "@/lib/utils/format"

/**
 * Every legal page on the site, by path, with the day it last changed. The one
 * list of them: `LegalPageLayout` prints the date from here (a page passes
 * only its path, so a page missing from this list doesn't type-check),
 * `sitemap.ts` lists every path with the date as `lastModified`, and
 * `legalPagesVoice.test.tsx` checks that it covers every one.
 *
 * Change a page's date here when its text changes, in the same commit.
 */
export const LEGAL_PAGE_LAST_UPDATED = {
	"/privacy": "2026-10-19",
	"/privacy/continuum": "2026-05-30",
	"/privacy/continuum/dpia": "2026-06-08",
	"/privacy/continuum/responsible-use": "2026-06-10",
	"/privacy/digest": "2026-10-22",
	"/privacy/reckon": "2026-10-22",
	"/privacy/weekly-gym": "2026-10-21",
	"/terms/continuum": "2026-10-19",
	"/terms/digest": "2026-10-19",
	"/terms/weekly-gym": "2026-10-20",
} as const satisfies Record<string, IsoDay>

export type LegalPagePath = keyof typeof LEGAL_PAGE_LAST_UPDATED
