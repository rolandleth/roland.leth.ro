import AnimatedCard from "@/components/AnimatedCard"
import AppTile from "@/components/projects/gallery/AppTile"
import AppTileStyle from "@/components/projects/gallery/AppTileStyle"
import EarlierProjects from "@/components/projects/gallery/EarlierProjects"
import WorkCard from "@/components/projects/gallery/WorkCard"
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
 * The projects gallery: the own apps first, each on its product page's
 * colours, then the work projects, then everything else under "Earlier
 * projects", collapsed. Which section a project lands in follows from its
 * featured and own-app flags (`gallerySections`).
 *
 * The apps and the work projects have no heading of their own, only the space
 * between them: each section is named for screen readers only, and each tile's
 * and card's title is an `h2`, so the outline doesn't skip a level.
 */
export default async function ProjectsPage() {
	const { apps, work, earlier } = gallerySections(
		await getProjectsGalleryCached()
	)

	return (
		<div className="product-frame pt-8 pb-24 sm:pt-12">
			<h1 className="text-primary mb-8 font-serif text-[34px] leading-none font-normal tracking-[-0.02em] min-[900px]:text-[40px]">
				Projects
			</h1>

			{apps.length > 0 && (
				<section id="my-apps" aria-label="My apps">
					<AppTileStyle apps={apps} />

					<div className="grid gap-4 min-[900px]:grid-cols-2">
						{apps.map((project, index) => {
							const isWide = isWideAppTile(index, apps.length)

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

			{work.length > 0 && (
				<section
					id="work"
					aria-label="Work"
					className={apps.length > 0 ? SECTION_GAP_CLASS : ""}
				>
					<div className="flex flex-col gap-4">
						{work.map((project, index) => (
							<AnimatedCard
								key={project.id}
								index={apps.length + index}
								delayMultiplier={STAGGER}
							>
								<WorkCard project={project} />
							</AnimatedCard>
						))}
					</div>
				</section>
			)}

			<EarlierProjects
				projects={earlier}
				className={apps.length + work.length > 0 ? SECTION_GAP_CLASS : ""}
			/>
		</div>
	)
}
