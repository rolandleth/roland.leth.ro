import { ProjectPageLayout, ProjectProminence } from "@/generated/prisma/enums"

/**
 * The admin's names for each prominence level, shared by the project form and
 * the inline picker on the projects list. A `Record` over the enum, so a new
 * level fails the type-check here until it has a name.
 */
export const PROMINENCE_LABELS: Record<ProjectProminence, string> = {
	[ProjectProminence.high]: "High",
	[ProjectProminence.medium]: "Medium",
	[ProjectProminence.low]: "Low",
}

/** The admin's names for each page layout; a `Record` for the same reason. */
export const PAGE_LAYOUT_LABELS: Record<ProjectPageLayout, string> = {
	[ProjectPageLayout.product]: "Product page",
	[ProjectPageLayout.portfolio]: "Portfolio page",
}

/**
 * Shown beside a discontinued project's level when the level would place it
 * elsewhere (`isPlacementOverridden`), in the form and on the list's picker.
 */
export const DISCONTINUED_PLACEMENT_HINT =
	"Discontinued projects show under More projects, whatever the prominence."

/** The prominence levels in their declared order, highest first. */
export const PROMINENCE_OPTIONS = Object.values(ProjectProminence)

/** The page layouts in their declared order. */
export const PAGE_LAYOUT_OPTIONS = Object.values(ProjectPageLayout)
