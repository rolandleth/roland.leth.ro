import AnimatedCard from "@/components/AnimatedCard"
import AppTile from "@/components/projects/gallery/AppTile"
import AppTileStyle from "@/components/projects/gallery/AppTileStyle"
import MoreProjects from "@/components/projects/gallery/MoreProjects"
import ProjectCard from "@/components/projects/gallery/ProjectCard"
import { buildPageMetadata } from "@/lib/content/metadata"
import { getProjectsGalleryCached } from "@/lib/db/projects"
import { gallerySections, isWideAppTile } from "@/lib/utils/projectsGallery"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Projects",
	// Names the two current apps and the author: this page ranks for "roland
	// leth apps" and little else, and the snippet bolds the words the query has.
	description:
		"Reckon, a decision journal for iPhone and iPad; Continuum, private 1:1 notes for managers on Mac; and the other apps and tools Roland Leth has built or led.",
	path: "/projects",
})

// The fade-in's stagger between tiles and cards, in seconds.
const STAGGER = 0.05

// The space above a section that follows another.
const SECTION_GAP_CLASS = "mt-[88px]"

/**
 * The projects gallery, by prominence (`gallerySections`): high as big tiles,
 * each on its product page's colours, then medium as cards, then low and
 * discontinued under "More projects", collapsed.
 *
 * The tiles and the cards have no heading of their own, only the space
 * between them: each section is named for screen readers only, and each tile's
 * and card's title is an `h2`, so the outline doesn't skip a level.
 */
export default async function ProjectsPage() {
	const { high, medium, more } = gallerySections(
		await getProjectsGalleryCached()
	)

	return (
		<div className="product-frame pt-8 pb-24 sm:pt-12">
			<h1 className="text-primary mb-8 font-serif text-[34px] leading-none font-normal tracking-[-0.02em] min-[900px]:text-[40px]">
				Projects
			</h1>

			{high.length > 0 && (
				<section id="featured-projects" aria-label="Featured projects">
					<AppTileStyle apps={high} />

					<div className="grid gap-4 min-[900px]:grid-cols-2">
						{high.map((project, index) => {
							const isWide = isWideAppTile(index, high.length)

							return (
								<AnimatedCard
									key={project.id}
									index={index}
									delayMultiplier={STAGGER}
									className={isWide ? "min-[900px]:col-span-2" : ""}
								>
									<AppTile
										project={project}
										isWide={isWide}
										isImagePriority={index === 0}
									/>
								</AnimatedCard>
							)
						})}
					</div>
				</section>
			)}

			{medium.length > 0 && (
				<section
					id="selected-projects"
					aria-label="Selected projects"
					className={high.length > 0 ? SECTION_GAP_CLASS : ""}
				>
					<div className="flex flex-col gap-4">
						{medium.map((project, index) => (
							<AnimatedCard
								key={project.id}
								index={high.length + index}
								delayMultiplier={STAGGER}
							>
								<ProjectCard project={project} />
							</AnimatedCard>
						))}
					</div>
				</section>
			)}

			<MoreProjects
				projects={more}
				className={high.length + medium.length > 0 ? SECTION_GAP_CLASS : ""}
			/>
		</div>
	)
}
