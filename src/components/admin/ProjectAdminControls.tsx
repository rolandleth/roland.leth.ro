import IsFeaturedToggle from "@/components/admin/IsFeaturedToggle"
import ProjectSortOrderInput from "@/components/admin/ProjectSortOrderInput"
import type { ProjectListItem } from "@/lib/projects"

interface Props {
	project: ProjectListItem
	totalCount: number
}

/**
 * Inline editor pair (Featured toggle + sort-order input) rendered inside each
 * admin project card. Keyed by `sortOrder` so the input resets when a neighbour
 * shifts the card's position after a save.
 */
export default function ProjectAdminControls({ project, totalCount }: Props) {
	return (
		<>
			<IsFeaturedToggle
				projectId={project.id}
				initialIsFeatured={project.isFeatured}
			/>
			<ProjectSortOrderInput
				key={`${project.id}-${project.sortOrder}`}
				projectId={project.id}
				initialSortOrder={project.sortOrder}
				totalCount={totalCount}
			/>
		</>
	)
}
