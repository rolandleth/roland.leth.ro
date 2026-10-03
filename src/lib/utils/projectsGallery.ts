// Pure rules for the `/projects` gallery: which part of the page a project
// lands in, and which app tile spans the row. Kept free of React so they're
// unit-testable.

import { ProjectProminence } from "@/generated/prisma/enums"

/** The gallery's three parts, each in the order the projects came in. */
export interface GallerySections<T> {
	/** Live `high` projects: the big tiles under the page title. */
	high: T[]
	/** Live `medium` projects: the cards under the tiles. */
	medium: T[]
	/** Live `low` projects and every discontinued one: "More projects". */
	more: T[]
}

/** One of the gallery's three parts. */
export type GallerySection = keyof GallerySections<unknown>

/** What placing a project reads: its level, and whether it's discontinued. */
interface Placement {
	prominence: ProjectProminence
	isDiscontinued: boolean
}

/**
 * The part a level puts a live project in. Every level has its case: a new one
 * fails the type-check here until it's placed. A value this code doesn't know
 * (a database ahead of the deploy) lands under "More projects", and the log
 * says so rather than the project disappearing.
 */
function sectionForProminence(prominence: ProjectProminence): GallerySection {
	switch (prominence) {
		case ProjectProminence.high:
			return "high"
		case ProjectProminence.medium:
			return "medium"
		case ProjectProminence.low:
			return "more"
		default: {
			const unknown: never = prominence
			// eslint-disable-next-line no-console
			console.error(
				"[projects:gallery] unknown prominence, listed under More projects",
				{ prominence: unknown }
			)

			return "more"
		}
	}
}

/**
 * The part a project lands in. A discontinued project goes to "More projects"
 * whatever its level, so no level needs a rule against it, and the level comes
 * back with the project.
 */
export function gallerySectionOf(project: Placement): GallerySection {
	return project.isDiscontinued
		? "more"
		: sectionForProminence(project.prominence)
}

/**
 * Whether being discontinued keeps a project out of the part its level names:
 * a discontinued `high` or `medium` one. The admin says so beside the level
 * then, since the level it shows no longer decides where the project lands.
 */
export function isPlacementOverridden(project: Placement): boolean {
	return (
		project.isDiscontinued &&
		sectionForProminence(project.prominence) !== "more"
	)
}

/**
 * Sorts projects into the gallery's parts (`gallerySectionOf`), each part in
 * the order the projects came in.
 */
export function gallerySections<T extends Placement>(
	projects: readonly T[]
): GallerySections<T> {
	const sections: GallerySections<T> = { high: [], medium: [], more: [] }

	for (const project of projects) {
		sections[gallerySectionOf(project)].push(project)
	}

	return sections
}

/**
 * Whether the app tile at `index` spans both columns. Only the first does, and
 * only when the count is odd: the rest pair up two to a row, so no half tile
 * ever sits alone beside an empty column. One app is a single wide tile; two
 * are a row of halves; three are a wide tile over a row of halves.
 */
export function isWideAppTile(index: number, count: number): boolean {
	return index === 0 && count % 2 === 1
}
