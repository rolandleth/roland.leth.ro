// Pure mappers that turn validated section/link inputs into Prisma nested-create
// clauses. Kept Next-free (no `next/cache`, no React `cache`) and separate from
// `projects.ts` so the project-import script (`scripts/import-projects.ts`) can
// reuse the exact create-shaping logic without dragging the Next runtime into a
// plain node process. `projects.ts` re-exports these so existing callers keep
// importing from `@/lib/db/projects`.

export type ProjectSectionInput = {
	title: string
	description: string
	sortOrder?: number
	images?: { url: string; caption?: string | null; sortOrder?: number }[]
}

export type ProjectLinkInput = {
	label: string
	url: string
	sortOrder?: number
}

export type ProjectFaqInput = {
	question: string
	answer: string
	sortOrder?: number
}

/**
 * Maps validated section inputs into a Prisma nested-create clause,
 * defaulting `sortOrder` and nested image fields so callers don't have to.
 */
export function toSectionCreate(sections: ProjectSectionInput[] | undefined) {
	if (sections == null) {
		return undefined
	}

	return {
		create: sections.map((s) => ({
			title: s.title,
			description: s.description,
			sortOrder: s.sortOrder ?? 0,
			images: s.images
				? {
						create: s.images.map((img) => ({
							url: img.url,
							caption: img.caption ?? null,
							sortOrder: img.sortOrder ?? 0,
						})),
					}
				: undefined,
		})),
	}
}

/**
 * Maps validated link inputs into a Prisma nested-create clause,
 * defaulting `sortOrder` so callers don't have to.
 */
export function toLinkCreate(links: ProjectLinkInput[] | undefined) {
	if (links == null) {
		return undefined
	}

	return {
		create: links.map((l) => ({
			label: l.label,
			url: l.url,
			sortOrder: l.sortOrder ?? 0,
		})),
	}
}

/**
 * Maps validated FAQ inputs into a Prisma nested-create clause,
 * defaulting `sortOrder` so callers don't have to.
 */
export function toFaqCreate(faqs: ProjectFaqInput[] | undefined) {
	if (faqs == null) {
		return undefined
	}

	return {
		create: faqs.map((f) => ({
			question: f.question,
			answer: f.answer,
			sortOrder: f.sortOrder ?? 0,
		})),
	}
}
