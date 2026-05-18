export const SECTIONS = ["tech", "life"] as const

export type Section = (typeof SECTIONS)[number]

export function isValidSection(value: string): value is Section {
	return SECTIONS.includes(value as Section)
}

export function capitalizeSection(section: Section): string {
	return section.charAt(0).toUpperCase() + section.slice(1)
}
