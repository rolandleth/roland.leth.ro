export const SECTIONS = ["tech", "life"] as const

export type Section = (typeof SECTIONS)[number]

export function isValidSection(value: string): value is Section {
	return SECTIONS.includes(value as Section)
}

export function capitalizeSection(section: Section): string {
	return section.charAt(0).toUpperCase() + section.slice(1)
}

// One line per section, written for the search result: the meta description of
// every list page (`/blog/:section` and `/blog/:section/p/:page`) and the tech
// blog's line in llms.txt. llms.txt and the sitemap both push `/blog/tech` as the
// blog's front door, so a placeholder there is what a searcher saw. `life` keeps
// its placeholder until that section has a line worth writing.
export const SECTION_DESCRIPTIONS: Record<Section, string> = {
	tech: "Posts on iOS, Next.js and building software with AI, going back to 2013.",
	life: "Thoughts on life.",
}
