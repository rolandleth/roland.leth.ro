import Link from "next/link"
import AdminPagination from "@/components/admin/AdminPagination"
import ProjectAdminGroup from "@/components/admin/ProjectAdminGroup"
import { buildAdminPageUrl } from "@/lib/client/adminPageUrl"
import { listProjectsForAdmin } from "@/lib/db/projects"
import { groupByPlatform } from "@/lib/utils/platforms"
import type { ProjectGalleryItem } from "@/lib/db/projects"

interface Props {
	query: string
	page: number
}

function ProjectsGroupedView({ projects }: { projects: ProjectGalleryItem[] }) {
	const featured = projects.filter((p) => p.isFeatured)
	const others = projects.filter((p) => !p.isFeatured)
	const platformGroups = groupByPlatform(others)
	const totalCount = projects.length

	if (projects.length === 0) {
		return <p className="text-secondary py-4 text-sm">No projects yet.</p>
	}

	return (
		<div className="flex flex-col gap-10">
			<ProjectAdminGroup
				label="Featured"
				projects={featured}
				totalCount={totalCount}
			/>

			{platformGroups.map((group) => (
				<ProjectAdminGroup
					key={group.label}
					label={group.label}
					projects={group.projects}
					totalCount={totalCount}
				/>
			))}
		</div>
	)
}

export default async function ProjectsTab({ query, page }: Props) {
	const isSearching = query.length > 0
	const { projects, totalCount, totalPages } = await listProjectsForAdmin({
		query,
		page,
	})

	const urlForPage = (p: number) =>
		buildAdminPageUrl({ tab: "projects", query, page: p })

	return (
		<section>
			<div className="mb-4 flex items-center justify-between">
				<p className="text-secondary text-xs">
					{isSearching
						? `${totalCount} result${totalCount === 1 ? "" : "s"}`
						: `${totalCount} projects`}
				</p>
				<Link
					href="/admin/projects/new"
					className="text-accent text-sm transition-opacity hover:opacity-75"
				>
					New project
				</Link>
			</div>

			{isSearching ? (
				<div className="divide-border divide-y">
					{projects.map((project) => (
						<div
							key={project.id}
							className="flex items-center justify-between py-3"
						>
							<div>
								<p className="text-primary text-sm font-medium">
									{project.name}
								</p>
								<p className="text-secondary mt-0.5 text-xs">
									{project.platform}
									{project.isFeatured && " · Featured"}
								</p>
							</div>
							<Link
								href={`/admin/projects/${project.id}/edit`}
								prefetch={false}
								className="text-secondary hover:text-primary text-xs transition-colors"
							>
								Edit
							</Link>
						</div>
					))}

					{projects.length === 0 && (
						<p className="text-secondary py-4 text-sm">
							No results for &quot;{query}&quot;.
						</p>
					)}
				</div>
			) : (
				<ProjectsGroupedView projects={projects} />
			)}

			<AdminPagination
				page={page}
				totalPages={totalPages}
				urlForPage={urlForPage}
			/>
		</section>
	)
}
