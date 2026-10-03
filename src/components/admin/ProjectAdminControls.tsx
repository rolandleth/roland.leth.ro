import ProjectProminenceSelect from "@/components/admin/ProjectProminenceSelect"
import ProjectSortOrderInput from "@/components/admin/ProjectSortOrderInput"
import type { ProjectListItem } from "@/lib/db/projects"

interface Props {
	project: ProjectListItem
	totalCount: number
}

/**
 * Inline editor pair (prominence picker + sort-order input) rendered inside
 * each admin project card. Each is keyed by the value it edits, so it resets
 * when the server's value changes under it: a neighbour shifting the card's
 * position, or the edit form changing the prominence.
 */
export default function ProjectAdminControls({ project, totalCount }: Props) {
	return (
		<>
			<ProjectProminenceSelect
				key={`${project.id}-${project.prominence}`}
				projectId={project.id}
				initial={project.prominence}
				isDiscontinued={project.isDiscontinued}
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
