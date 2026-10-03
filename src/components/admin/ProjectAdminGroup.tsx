import ProjectAdminControls from "@/components/admin/ProjectAdminControls"
import CompactProjectCard from "@/components/projects/CompactProjectCard"
import FeaturedProjectCard from "@/components/projects/FeaturedProjectCard"
import type { ProjectGalleryItem } from "@/lib/db/projects"

/** `large`: the two-column card grid; `compact`: the icon grid. */
export type ProjectAdminGroupVariant = "large" | "compact"

interface Props {
	label: string
	variant: ProjectAdminGroupVariant
	projects: ProjectGalleryItem[]
	totalCount: number
}

/**
 * Renders one labelled admin group of projects in the layout `variant` names.
 * Each card embeds the inline prominence and sort-order controls.
 */
export default function ProjectAdminGroup({
	label,
	variant,
	projects,
	totalCount,
}: Props) {
	if (projects.length === 0) {
		return null
	}

	return (
		<div>
			<h3 className="text-secondary mb-4 text-xs font-semibold tracking-widest uppercase">
				{label}
			</h3>

			{variant === "large" ? (
				<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
					{projects.map((project) => (
						<FeaturedProjectCard
							key={project.id}
							project={project}
							href={`/admin/projects/${project.id}/edit`}
						>
							<div className="mt-2 flex items-center justify-between gap-3 px-1">
								<ProjectAdminControls
									project={project}
									totalCount={totalCount}
								/>
							</div>
						</FeaturedProjectCard>
					))}
				</div>
			) : (
				<div className="grid grid-cols-4 gap-1 sm:grid-cols-6 md:grid-cols-8">
					{projects.map((project) => (
						<CompactProjectCard
							key={project.id}
							project={project}
							href={`/admin/projects/${project.id}/edit`}
						>
							<div className="mt-1 flex flex-col items-center gap-1">
								<ProjectAdminControls
									project={project}
									totalCount={totalCount}
								/>
							</div>
						</CompactProjectCard>
					))}
				</div>
			)}
		</div>
	)
}
