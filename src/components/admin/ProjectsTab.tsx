import Link from "next/link"
import AdminPagination from "@/components/admin/AdminPagination"
import ProjectAdminGroup from "@/components/admin/ProjectAdminGroup"
import {
	PROMINENCE_LABELS,
	PROMINENCE_OPTIONS,
} from "@/components/admin/projectPlacement"
import { ProjectProminence } from "@/generated/prisma/enums"
import { buildAdminPageUrl } from "@/lib/client/adminPageUrl"
import { listProjectsForAdmin } from "@/lib/db/projects"
import { detailLabel, groupByBucket } from "@/lib/utils/platforms"
import type { ProjectAdminGroupVariant } from "@/components/admin/ProjectAdminGroup"
import type { ProjectGalleryItem } from "@/lib/db/projects"

interface Props {
	query: string
	page: number
}

/**
 * The admin layout for a prominence level. A switch with no default, so a new
 * level fails the type-check here until it picks one.
 */
function adminVariantFor(
	prominence: ProjectProminence
): ProjectAdminGroupVariant {
	switch (prominence) {
		case ProjectProminence.high:
		case ProjectProminence.medium:
			return "large"
		case ProjectProminence.low:
			return "compact"
	}
}

/**
 * One large group per level that gets one, in declared order, then the rest
 * as compact groups by platform. Grouped by the stored level, not by where the
 * public gallery shows the project: this is where the level is edited, and a
 * discontinued project keeps its level here.
 */
function ProjectsGroupedView({ projects }: { projects: ProjectGalleryItem[] }) {
	const largeLevels = PROMINENCE_OPTIONS.filter(
		(level) => adminVariantFor(level) === "large"
	)
	// `!== "large"` rather than `=== "compact"`: a level this code doesn't know
	// (a database ahead of the deploy) still shows, under its platform.
	const compact = projects.filter(
		(p) => adminVariantFor(p.prominence) !== "large"
	)
	const bucketGroups = groupByBucket(compact)
	const totalCount = projects.length

	if (projects.length === 0) {
		return <p className="text-secondary py-4 text-sm">No projects yet.</p>
	}

	return (
		<div className="flex flex-col gap-10">
			{largeLevels.map((level) => (
				<ProjectAdminGroup
					key={level}
					label={PROMINENCE_LABELS[level]}
					variant="large"
					projects={projects.filter((p) => p.prominence === level)}
					totalCount={totalCount}
				/>
			))}

			{bucketGroups.map((group) => (
				<ProjectAdminGroup
					key={group.bucket}
					label={group.label}
					variant="compact"
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
									{detailLabel(project.bucket, project.platformTags)}
									{` · ${PROMINENCE_LABELS[project.prominence]} prominence`}
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
