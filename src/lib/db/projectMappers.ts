// Pure mappers that turn validated section/link inputs into Prisma nested-create
// clauses. Kept Next-free (no `next/cache`, no React `cache`) and separate from
// `projects.ts` so the project-import script (`scripts/import-projects.ts`) can
// reuse the exact create-shaping logic without dragging the Next runtime into a
// plain node process. `projects.ts` re-exports these so existing callers keep
// importing from `@/lib/db/projects`.

import { Prisma } from "@/generated/prisma/client"
import type { ProjectPalette, ProjectPlan } from "./projects"
import type { ProjectSectionLayout } from "@/generated/prisma/enums"

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

export type ProjectImageInput = {
	url: string
	caption?: string | null
	alt?: string | null
	sortOrder?: number
}

export type ProjectSectionItemInput = {
	title: string
	description: string
	sortOrder?: number
	images?: ProjectImageInput[]
}

type SectionBaseInput = {
	title: string
	sortOrder?: number
}

/** Mirrors `projectSectionSchema`: one shape per `ProjectSectionKind`. */
export type ProjectSectionInput =
	| (SectionBaseInput & {
			kind: "text"
			layout: ProjectSectionLayout
			description: string
			images?: ProjectImageInput[]
	  })
	| (SectionBaseInput & {
			kind: "steps"
			description?: string
			items: ProjectSectionItemInput[]
	  })
	| (SectionBaseInput & {
			kind: "pricing"
			description?: string
	  })

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
 * Each kind writes only what it holds: `layout` and images for `text`, the
 * steps for `steps`. A missing body (the optional intro or note) is stored as
 * "", since the column isn't nullable.
 */
export function toSectionCreate(sections: ProjectSectionInput[] | undefined) {
	if (sections == null) {
		return undefined
	}

	return { create: sections.map(toOneSectionCreate) }
}

function toOneSectionCreate(section: ProjectSectionInput) {
	const base = {
		title: section.title,
		description: section.description ?? "",
		sortOrder: section.sortOrder ?? 0,
		kind: section.kind,
	}

	switch (section.kind) {
		case "text":
			return {
				...base,
				layout: section.layout,
				images: toImageCreate(section.images),
			}
		case "steps":
			return {
				...base,
				layout: null,
				items: {
					create: section.items.map((item, index) => ({
						title: item.title,
						description: item.description,
						sortOrder: item.sortOrder ?? index,
						images: toImageCreate(item.images),
					})),
				},
			}
		case "pricing":
			return { ...base, layout: null }
	}
}

/**
 * Image rows for a section or a step. A missing `sortOrder` falls back to the
 * image's position, so a manifest can list images in order without numbering
 * them; a shared 0 would leave their order to the database.
 */
function toImageCreate(images: ProjectImageInput[] | undefined) {
	if (images == null) {
		return undefined
	}

	return {
		create: images.map((image, index) => ({
			url: image.url,
			caption: image.caption ?? null,
			alt: image.alt ?? null,
			sortOrder: image.sortOrder ?? index,
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
