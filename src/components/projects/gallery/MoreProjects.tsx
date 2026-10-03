import Link from "next/link"
import {
	compactLabel,
	groupByBucket,
	isCompactLabelRedundant,
} from "@/lib/utils/platforms"
import MoreProjectsDisclosure from "./MoreProjectsDisclosure"
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

const ICON_SIZE = 56

// The lift on hover live's compact cards have: 2px, and none for readers who
// ask for less motion. Only these icons lift, since they're links; the tiles
// and cards above aren't.
const ICON_LIFT_CLASS =
	"transition-transform duration-300 motion-safe:hover:-translate-y-0.5"

/**
 * The low-prominence and discontinued projects, under one heading with a
 * count, closed at first. Closed, the first row of icons previews what's
 * inside; open, the projects come grouped by platform (iOS, Mac, Web, open
 * source), each icon linking to its page. The lists render here, on the
 * server, and the open-and-close part is `MoreProjectsDisclosure`, so every
 * link is in the HTML either way.
 *
 * The preview is decoration, hidden from assistive tech, and its icons aren't
 * links: the heading's button opens the real list.
 */
export default function MoreProjects({ projects, className = "" }: Props) {
	if (projects.length === 0) {
		return null
	}

	const groups = groupByBucket([...projects])
	const preview = groups
		.flatMap((group) => group.projects)
		.slice(0, PREVIEW_COUNT)

	return (
		<MoreProjectsDisclosure
			id="more-projects"
			count={projects.length}
			className={className}
			preview={
				<ul aria-hidden className={ICON_GRID_CLASS}>
					{preview.map((project) => (
						<li
							key={project.id}
							className="flex min-w-0 flex-col items-center gap-2.5 text-center"
						>
							<ListedIcon project={project} />
							<ListedName project={project} />
						</li>
					))}
				</ul>
			}
		>
			<div className="flex flex-col gap-8">
				{groups.map((group) => (
					<div key={group.bucket}>
						<h3 className="text-primary mb-4 text-[13px] font-semibold">
							{group.label}
						</h3>

						<ul role="list" className={ICON_GRID_CLASS}>
							{group.projects.map((project) => (
								<ListedProject key={project.id} project={project} />
							))}
						</ul>
					</div>
				))}
			</div>
		</MoreProjectsDisclosure>
	)
}

/**
 * One listed project: its icon and name, linking to its page, and under them
 * the platform tag when it says more than the group's heading ("Multiplatform"
 * under iOS, "Fullstack" or "React" under Web).
 */
function ListedProject({ project }: { project: ProjectGalleryItem }) {
	const { bucket, platformTags } = project
	const tag = isCompactLabelRedundant(bucket, platformTags)
		? null
		: compactLabel(bucket, platformTags)

	return (
		<li className="flex min-w-0 flex-col items-center text-center">
			<Link
				href={`/projects/${project.slug}`}
				className={`group/project flex flex-col items-center gap-2.5 no-underline ${ICON_LIFT_CLASS}`}
			>
				<ListedIcon project={project} />
				<ListedName project={project} />
			</Link>

			{tag != null && (
				<span className="text-secondary mt-0.5 text-[11px] leading-[1.3]">
					{tag}
				</span>
			)}
		</li>
	)
}

/**
 * The icon, greyed out for a discontinued project: the fade sits on the icon
 * alone, so the name keeps its contrast.
 */
function ListedIcon({ project }: { project: ProjectGalleryItem }) {
	return (
		<ProjectIcon
			name={project.name}
			icon={project.icon}
			size={ICON_SIZE}
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
