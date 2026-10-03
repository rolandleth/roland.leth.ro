// Pure rules for the `/projects` gallery: which section a project lands in, and
// which app tile spans the row. Kept free of React so they're unit-testable.

/** The gallery's three parts, each in the order the projects came in. */
export interface GallerySections<T> {
	/** "My apps": featured projects that are Roland's own apps. */
	apps: T[]
	/** "Work": featured projects made for an employer or a client. */
	work: T[]
	/** "Earlier projects": everything not featured. */
	earlier: T[]
}

/**
 * Sorts projects into the gallery's sections by the two flags that already say
 * where one belongs, so no combination lands nowhere or twice: featured own
 * apps are "My apps", other featured projects are "Work", and the rest are
 * "Earlier projects".
 */
export function gallerySections<
	T extends { isFeatured: boolean; isOwnApp: boolean },
>(projects: readonly T[]): GallerySections<T> {
	const sections: GallerySections<T> = { apps: [], work: [], earlier: [] }

	for (const project of projects) {
		if (!project.isFeatured) {
			sections.earlier.push(project)
		} else if (project.isOwnApp) {
			sections.apps.push(project)
		} else {
			sections.work.push(project)
		}
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
