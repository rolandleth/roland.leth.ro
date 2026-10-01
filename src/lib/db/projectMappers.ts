// Pure mappers that turn validated section/link inputs into Prisma nested-create
// clauses. Kept Next-free (no `next/cache`, no React `cache`) and separate from
// `projects.ts` so the project-import script (`scripts/import-projects.ts`) can
// reuse the exact create-shaping logic without dragging the Next runtime into a
// plain node process. `projects.ts` re-exports these so existing callers keep
// importing from `@/lib/db/projects`.

import { Prisma } from "@/generated/prisma/client"
import type { ProjectPalette, ProjectPlan } from "./projects"

export type ProductPageInput = {
	metaDescription?: string | null
	heroEyebrow?: string | null
	heroHeadline?: string | null
	heroImageAlt?: string | null
	storeNote?: string | null
	closingHeadline?: string | null
	closingBody?: string | null
	disclaimer?: string | null
	plans?: ProjectPlan[]
	palette?: ProjectPalette
}

/**
 * The product-page columns for a create, each absent value written as null.
 * Shared by `POST /api/admin/projects` and `scripts/import-projects.ts`, the
 * two paths that create a project row, so they can't drift on which of these
 * fields they write. (`PUT` spreads its parsed payload instead, where an absent
 * field means "leave it".)
 */
export function toProductPageCreate(input: ProductPageInput) {
	return {
		metaDescription: input.metaDescription ?? null,
		heroEyebrow: input.heroEyebrow ?? null,
		heroHeadline: input.heroHeadline ?? null,
		heroImageAlt: input.heroImageAlt ?? null,
		storeNote: input.storeNote ?? null,
		closingHeadline: input.closingHeadline ?? null,
		closingBody: input.closingBody ?? null,
		disclaimer: input.disclaimer ?? null,
		// Nullable Json columns: a bare `null` is reserved by Prisma for JSON
		// filters, so the absent case writes SQL NULL via `Prisma.DbNull`, as
		// `offers` does.
		plans: input.plans ?? Prisma.DbNull,
		palette: input.palette ?? Prisma.DbNull,
	}
}

export type ProjectSectionInput = {
	title: string
	description: string
	sortOrder?: number
	hasPlans?: boolean
	images?: {
		url: string
		caption?: string | null
		alt?: string | null
		sortOrder?: number
	}[]
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
			hasPlans: s.hasPlans ?? false,
			images: s.images
				? {
						create: s.images.map((img) => ({
							url: img.url,
							caption: img.caption ?? null,
							alt: img.alt ?? null,
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
