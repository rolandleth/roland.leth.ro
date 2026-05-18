import BooleanFlagToggle from "@/components/admin/BooleanFlagToggle"
import ProjectSortOrderInput from "@/components/admin/ProjectSortOrderInput"
import type { ProjectListItem } from "@/lib/db/projects"

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
			<BooleanFlagToggle
				initial={project.isFeatured}
				url={`/api/admin/projects/${project.id}`}
				payloadKey="isFeatured"
				label="Featured"
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
