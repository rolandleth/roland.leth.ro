import PageGlow from "@/components/PageGlow"
import AnimatedProjectCard from "@/components/projects/AnimatedProjectCard"
import CompactProjectCard from "@/components/projects/CompactProjectCard"
import FeaturedProjectCard from "@/components/projects/FeaturedProjectCard"
import { getAllProjectsForGallery } from "@/lib/projects"
import type { ProjectGalleryItem } from "@/lib/projects"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "Projects",
	description: "Apps and tools built or led by Roland Leth.",
	openGraph: {
		title: "Projects | Roland Leth",
		description: "Apps and tools built or led by Roland Leth.",
		url: "/projects",
	},
}

// Platform bucket labels and their match keywords
const PLATFORM_BUCKETS: { label: string; keywords: string[] }[] = [
	{ label: "Mobile", keywords: ["ios", "android", "mobile", "iphone", "ipad"] },
	{ label: "Mac", keywords: ["mac", "macos", "desktop"] },
	{ label: "Web", keywords: ["web", "website", "react", "next"] },
]

function platformBucket(platform: string): string {
	const lower = platform.toLowerCase()

	for (const bucket of PLATFORM_BUCKETS) {
		if (bucket.keywords.some((kw) => lower.includes(kw))) {
			return bucket.label
		}
	}

	return "Other"
}

function groupByPlatform(
	projects: ProjectGalleryItem[]
): { label: string; projects: ProjectGalleryItem[] }[] {
	const buckets = new Map<string, ProjectGalleryItem[]>()

	for (const project of projects) {
		const label = platformBucket(project.platform)
		const existing = buckets.get(label) ?? []
		buckets.set(label, [...existing, project])
	}

	// Preserve canonical order: Mobile → Mac → Web → Other
	const order = ["Mobile", "Mac", "Web", "Other"]

	return order
		.filter((label) => buckets.has(label))
		.map((label) => ({ label, projects: buckets.get(label) ?? [] }))
}

export default async function ProjectsPage() {
	const allProjects = await getAllProjectsForGallery()
	const featured = allProjects.filter((p) => p.isFeatured)
	const others = allProjects.filter((p) => !p.isFeatured)
	const platformGroups = groupByPlatform(others)

	return (
		<main className="relative mx-auto max-w-5xl px-4 py-12">
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
							<AnimatedProjectCard key={project.id} index={i}>
								<FeaturedProjectCard project={project} isPriority={i === 0} />
							</AnimatedProjectCard>
						))}
					</div>
				</section>
			)}

			{/* Other projects grouped by platform */}
			{platformGroups.map((group, gi) => (
				<section key={group.label} className="mb-12">
					<h2 className="text-secondary mb-5 text-xs font-semibold tracking-widest uppercase">
						{group.label}
					</h2>

					<div className="grid grid-cols-4 gap-1 sm:grid-cols-6 md:grid-cols-8">
						{group.projects.map((project, i) => (
							<AnimatedProjectCard
								key={project.id}
								index={featured.length + gi * 4 + i}
							>
								<CompactProjectCard project={project} />
							</AnimatedProjectCard>
						))}
					</div>
				</section>
			))}
		</main>
	)
}
