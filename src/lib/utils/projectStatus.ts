// Pure rules that read a project's `status`, shared by the gallery, the detail
// pages, the admin and the data layer. Kept free of React and Prisma's client
// so they reach the client bundle and are unit-testable.

import { ProjectStatus } from "@/generated/prisma/enums"

/** Whether the project was pulled: the one status that moves it on `/projects`. */
export function isDiscontinued(project: { status: ProjectStatus }): boolean {
	return project.status === ProjectStatus.discontinued
}

/**
 * The words the site shows beside a project's name for its status, or null for
 * a live project, which shows none. Every status has its case: a new one fails
 * the type-check here until it has an answer. A value this code doesn't know (a
 * database ahead of the deploy) shows no label, and the log says so.
 */
export function statusLabel(status: ProjectStatus): string | null {
	switch (status) {
		case ProjectStatus.comingSoon:
			return "Coming soon"
		case ProjectStatus.live:
			return null
		case ProjectStatus.discontinued:
			return "Discontinued"
		default: {
			const unknown: never = status
			// eslint-disable-next-line no-console
			console.error("[projects:status] unknown status, shown without a label", {
				status: unknown,
			})

			return null
		}
	}
}

/**
 * The projects with every discontinued one moved to the end, each kind in the
 * order it came in (`Array.sort` is stable). A coming-soon project keeps its
 * place among the live ones: its `sortOrder` decides, as for a live one.
 */
export function discontinuedLast<T extends { status: ProjectStatus }>(
	projects: readonly T[]
): T[] {
	return [...projects].sort(
		(a, b) => Number(isDiscontinued(a)) - Number(isDiscontinued(b))
	)
}
