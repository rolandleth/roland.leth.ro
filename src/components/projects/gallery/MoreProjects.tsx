import Link from "next/link"
import {
	compactLabel,
	groupByBucket,
	isCompactLabelRedundant,
} from "@/lib/utils/platforms"
import MoreProjectsDisclosure from "./MoreProjectsDisclosure"
import { FadeInWithList, SlideFromPreview } from "./MoreProjectsMotion"
import ProjectIcon from "./ProjectIcon"
import type { ProjectGalleryItem } from "@/lib/db/projects"

interface Props {
	projects: readonly ProjectGalleryItem[]
	className?: string
}

// How many icons the closed list previews: one row of the 10-column grid.
const PREVIEW_COUNT = 10

const ICON_GRID_CLASS =
	"m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-3 gap-y-6 p-0 min-[900px]:grid-cols-10"

// The preview's `li`s and the full list's share this box, so a preview icon and
// its place in the list sit alike in their columns, and the slide between them
// is a plain move. Each `li` also carries its project's id, which is how the
// disclosure pairs them.
const ITEM_CLASS = "flex min-w-0 flex-col items-center text-center"

const ICON_SIZE = 56

// The lift on hover live's compact cards have: 2px, and none for readers who
// ask for less motion. Only these icons lift, since they're links; the tiles
// and cards above aren't.
const ICON_LIFT_CLASS =
	"transition-transform duration-300 motion-safe:hover:-translate-y-0.5"

/**
 * The low-prominence and discontinued projects, under one heading with a
 * count, closed at first. Closed, a row of icons previews what's inside: live
 * projects from any platform, and discontinued ones only to fill the row, at
 * its end. Open, the projects come grouped by platform (iOS, Mac, Web, open
 * source).
 * Every icon links to its project's page, in the preview too. The lists
 * render here, on the server, and the open-and-close part is
 * `MoreProjectsDisclosure`, so every link is in the HTML either way.
 *
 * Opening slides each preview icon to its place in the list, and fades in the
 * rest (`MoreProjectsMotion`).
 */
export default function MoreProjects({ projects, className = "" }: Props) {
	if (projects.length === 0) {
		return null
	}

	const groups = groupByBucket([...projects])
	// Live projects first, each kind in the order the projects came in. The
	// gallery's query already sorts them so; the preview's pick shouldn't depend
	// on it. Picking from the groups instead would fill the row with the first
	// platform's projects, discontinued ones included, ahead of another
	// platform's live ones.
	const previewPicks = [...projects].sort(liveFirst).slice(0, PREVIEW_COUNT)
	// Grouped by platform, like the full list, so most icons slide straight down
	// to their groups. The discontinued ones still close the row, so theirs
	// slide back across it.
	const preview = groupByBucket(previewPicks)
		.flatMap((group) => group.projects)
		.sort(liveFirst)
	const previewIds = new Set(preview.map((project) => project.id))

	return (
		<MoreProjectsDisclosure
			id="more-projects"
			count={projects.length}
			className={className}
			preview={
				<ul role="list" className={ICON_GRID_CLASS}>
					{preview.map((project) => (
						<li
							key={project.id}
							data-project-id={project.id}
							className={ITEM_CLASS}
						>
							<ProjectLink project={project} />
						</li>
					))}
				</ul>
			}
		>
			<div className="flex flex-col gap-8">
				{groups.map((group) => (
					<div key={group.bucket}>
						<FadeInWithList
							as="h3"
							className="text-primary mb-4 text-[13px] font-semibold"
						>
							{group.label}
						</FadeInWithList>

						<ul role="list" className={ICON_GRID_CLASS}>
							{group.projects.map((project) => (
								<ListedProject
									key={project.id}
									project={project}
									isInPreview={previewIds.has(project.id)}
								/>
							))}
						</ul>
					</div>
				))}
			</div>
		</MoreProjectsDisclosure>
	)
}

interface ListedProjectProps {
	project: ProjectGalleryItem
	/** True when the preview row shows it too: it slides, where others fade. */
	isInPreview: boolean
}

/**
 * One project in the full list: its link, and under it the platform tag when
 * the tag says more than the group's heading ("Multiplatform" under iOS,
 * "Fullstack" or "React" under Web). The preview has no tags, so a tag always
 * fades.
 *
 * A project the preview shows slides from its preview icon, and its icon loads
 * with the page rather than when it scrolls near: a lazy one could still be
 * blank as it starts to slide. It's the same image the preview shows, so this
 * costs no extra download.
 */
function ListedProject({ project, isInPreview }: ListedProjectProps) {
	const { bucket, platformTags } = project
	const tag = isCompactLabelRedundant(bucket, platformTags)
		? null
		: compactLabel(bucket, platformTags)
	const tagLine =
		tag == null ? null : (
			<FadeInWithList className="text-secondary mt-0.5 text-[11px] leading-[1.3]">
				{tag}
			</FadeInWithList>
		)

	return (
		<li data-project-id={project.id} className={ITEM_CLASS}>
			{isInPreview ? (
				<SlideFromPreview projectId={String(project.id)}>
					<ProjectLink project={project} iconLoading="eager" />
					{tagLine}
				</SlideFromPreview>
			) : (
				<>
					<FadeInWithList>
						<ProjectLink project={project} />
					</FadeInWithList>
					{tagLine}
				</>
			)}
		</li>
	)
}

interface ProjectLinkProps {
	project: ProjectGalleryItem
	iconLoading?: "eager" | "lazy"
}

/** A project's icon and name, linking to its page. */
function ProjectLink({ project, iconLoading }: ProjectLinkProps) {
	return (
		<Link
			href={`/projects/${project.slug}`}
			className={`group/project flex flex-col items-center gap-2.5 no-underline ${ICON_LIFT_CLASS}`}
		>
			<ListedIcon project={project} loading={iconLoading} />
			<ListedName project={project} />
		</Link>
	)
}

interface ListedIconProps {
	project: ProjectGalleryItem
	loading?: "eager" | "lazy"
}

/**
 * The icon, greyed out for a discontinued project: the fade sits on the icon
 * alone, so the name keeps its contrast.
 */
function ListedIcon({ project, loading }: ListedIconProps) {
	return (
		<ProjectIcon
			name={project.name}
			icon={project.icon}
			size={ICON_SIZE}
			loading={loading}
			className={project.isDiscontinued ? "opacity-60 grayscale" : ""}
		/>
	)
}

/** The name: full contrast for a live project, secondary for a discontinued one. */
function ListedName({ project }: { project: ProjectGalleryItem }) {
	return (
		<span
			className={`text-[13px] leading-[1.3] transition-colors duration-200 group-hover/project:text-(--color-primary) ${
				project.isDiscontinued ? "text-secondary" : "text-primary"
			}`}
		>
			{project.name}
		</span>
	)
}

/**
 * Sorts live projects before discontinued ones. `Array.sort` is stable, so
 * each kind keeps the order it had.
 */
function liveFirst(a: ProjectGalleryItem, b: ProjectGalleryItem): number {
	return Number(a.isDiscontinued) - Number(b.isDiscontinued)
}
