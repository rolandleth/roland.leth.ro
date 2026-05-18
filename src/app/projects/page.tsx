import AnimatedCard from "@/components/AnimatedCard"
import PageGlow from "@/components/PageGlow"
import CompactProjectCard from "@/components/projects/CompactProjectCard"
import FeaturedProjectCard from "@/components/projects/FeaturedProjectCard"
import { buildPageMetadata } from "@/lib/content/metadata"
import { getAllProjectsForGallery } from "@/lib/db/projects"
import {
	groupByPlatform,
	isPlatformRedundantWithSection,
} from "@/lib/utils/platforms"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Projects",
	description: "Apps and tools built or led by Roland Leth.",
	path: "/projects",
})

export default async function ProjectsPage() {
	const allProjects = await getAllProjectsForGallery()
	const featured = allProjects.filter((p) => p.isFeatured)
	const others = allProjects.filter((p) => !p.isFeatured)
	const platformGroups = groupByPlatform(others)

	// Precompute a running stagger offset per group so each card's animation
	// index is unique across every group, independent of group size. A plain
	// for-of loop keeps the running sum local — assigning into a `let`
	// captured inside a `.map` callback trips the React Compiler's
	// `react-hooks/immutability` rule.
	const groupsWithStaggerStart: Array<
		(typeof platformGroups)[number] & { startIndex: number }
	> = []
	let offset = featured.length

	for (const group of platformGroups) {
		groupsWithStaggerStart.push({ ...group, startIndex: offset })
		offset += group.projects.length
	}

	return (
		<div className="relative mx-auto max-w-5xl px-4 py-12">
			<PageGlow />

			<div className="mb-10">
				<h1 className="text-primary text-3xl font-bold">Projects</h1>
			</div>

			{/* Featured projects */}
			{featured.length > 0 && (
				<section className="mb-16">
					<h2 className="text-secondary mb-6 text-xs font-semibold tracking-widest uppercase">
						Featured
					</h2>

					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
						{featured.map((project, i) => (
							<AnimatedCard key={project.id} index={i} delayMultiplier={0.05}>
								<FeaturedProjectCard project={project} isPriority={i === 0} />
							</AnimatedCard>
						))}
					</div>
				</section>
			)}

			{/* Other projects grouped by platform */}
			{groupsWithStaggerStart.map((group) => (
				<section key={group.label} className="mb-12">
					<h2
						className={`text-secondary mb-5 text-xs font-semibold tracking-widest ${group.label === "iOS" ? "" : "uppercase"}`}
					>
						{group.label}
					</h2>

					<div className="grid grid-cols-4 gap-1 sm:grid-cols-6 md:grid-cols-8">
						{group.projects.map((project, i) => (
							<AnimatedCard
								key={project.id}
								index={group.startIndex + i}
								delayMultiplier={0.05}
							>
								<CompactProjectCard
									project={project}
									showPlatformCapsule={
										!isPlatformRedundantWithSection(
											project.platform,
											group.label
										)
									}
								/>
							</AnimatedCard>
						))}
					</div>
				</section>
			))}
		</div>
	)
}
